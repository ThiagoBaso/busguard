"""Verificações de API, migrações, concorrência e restauração em MySQL descartável.

Não utiliza o Docker Compose do projeto, volumes existentes ou DATABASE_URL do ambiente.
Execute com as dependências de requirements-test.txt instaladas e Docker disponível.
"""
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
PASSWORD = 'busguard-disposable-test-only'
NAME = f'busguard-verify-{uuid4().hex[:12]}'


def run(args, *, input_bytes=None, env=None, capture=False):
    return subprocess.run(args, cwd=BACKEND, env=env, input=input_bytes, check=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def mysql(sql, database=None):
    command = ['docker', 'exec', '-i', '-e', f'MYSQL_PWD={PASSWORD}', NAME,
               'mysql', '-u', 'root', '--default-character-set=utf8mb4', '-N', '-B']
    if database:
        command.append(database)
    return run(command, input_bytes=sql.encode('utf-8'), capture=True).decode('utf-8').strip()


def load_fixture():
    run(['docker', 'exec', '-i', '-e', f'MYSQL_PWD={PASSWORD}', NAME, 'mysql', '-u', 'root',
         '--default-character-set=utf8mb4'], input_bytes=(ROOT / 'database' / 'init.sql').read_bytes(), capture=True)


def verify_credential_reload():
    """Confere a recarga somente no app_db do contêiner descartável criado aqui."""
    expected_tokens = (
        ('nfc_credentials', '80000000167', 'busguard:nfc:v1:b35df68203bf4988a62fb054be610261'),
        ('qr_credentials', '80000000167', 'busguard:qr:v1:d2fe7089c5ad4b7d865592bc102a46f3'),
        ('qr_credentials', '80000000329', 'busguard:qr:v1:a0973b6fe3a14411b34df671ec92d205'),
    )
    for table, cpf, token in expected_tokens:
        count = mysql(f"SELECT COUNT(*) FROM {table} c JOIN passengers p ON p.id=c.passenger_id "
                      f"WHERE p.cpf='{cpf}' AND c.status='active' AND c.token_hash=SHA2('{token}',256);", 'app_db')
        if count != '1':
            raise RuntimeError(f'Credencial fixa de demonstração incorreta: {table}, CPF {cpf}.')

    mysql("UPDATE nfc_credentials SET status='revoked', revoked_at='2026-01-01 00:00:00'; "
          "UPDATE qr_credentials SET status='pending', activated_at=NULL WHERE passenger_id=1; "
          "DELETE FROM access_events WHERE passenger_id=2; "
          "DELETE FROM passengers_responsibles WHERE passengers_id=2; "
          "DELETE FROM route_passengers WHERE passenger_id=2; "
          "UPDATE passengers SET id=1002 WHERE id=2; "
          "UPDATE passengers SET cpf='90000000009' WHERE id=4; "
          "UPDATE users SET cpf='99000000009' WHERE id=1;", 'app_db')
    for table, rows in (
        ('nfc_credentials', [(1002, 'active'), (3, 'pending'), (4, 'active')]),
        ('qr_credentials', [(1002, 'revoked'), (4, 'active')]),
    ):
        for passenger_id, status in rows:
            activated_at = 'NULL' if status == 'pending' else "'2026-01-01 00:01:00'"
            revoked_at = "'2026-01-01 00:02:00'" if status == 'revoked' else 'NULL'
            mysql(f"INSERT INTO {table} (passenger_id,token_hash,status,created_by,created_at,activated_at,revoked_at) "
                  f"VALUES ({passenger_id},SHA2('{table}-{passenger_id}',256),'{status}',1,'2026-01-01 00:00:00',"
                  f"{activated_at},{revoked_at});", 'app_db')

    def credential_state():
        return [mysql(f"SELECT c.id,p.cpf,c.token_hash,c.status,c.created_at,c.activated_at,c.revoked_at "
                      f"FROM {table} c JOIN passengers p ON p.id=c.passenger_id "
                      "WHERE p.cpf <> '90000000009' ORDER BY c.id;", 'app_db')
                for table in ('nfc_credentials', 'qr_credentials')]

    before = credential_state()
    for _ in range(2):
        load_fixture()
        if credential_state() != before:
            raise RuntimeError('A recarga alterou ou reativou credenciais NFC/QR existentes.')
        for table in ('nfc_credentials', 'qr_credentials'):
            if mysql(f'SELECT COUNT(*) FROM {table} WHERE passenger_id=4 OR created_by IS NOT NULL;', 'app_db') != '0':
                raise RuntimeError('A recarga reutilizou o ID de um passageiro ou autor diferente.')
            if mysql(f'SELECT COUNT(*) FROM {table} WHERE passenger_id=2;', 'app_db') != '1':
                raise RuntimeError('A recarga não reconstruiu o vínculo da credencial pelo CPF.')


def main():
    started = False
    try:
        print(f'Iniciando MySQL descartável {NAME} sem volumes...', flush=True)
        run(['docker', 'run', '-d', '--rm', '--name', NAME, '-p', '127.0.0.1::3306',
             '-e', f'MYSQL_ROOT_PASSWORD={PASSWORD}', 'mysql:8.0'], capture=True)
        started = True
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            ping = subprocess.run(['docker', 'exec', '-e', f'MYSQL_PWD={PASSWORD}', NAME,
                                   'mysqladmin', 'ping', '-h', '127.0.0.1', '-u', 'root', '--silent'],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ping.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('MySQL descartável não ficou pronto em 120 segundos.')
        port_output = run(['docker', 'port', NAME, '3306/tcp'], capture=True).decode().strip().splitlines()[0]
        port = int(port_output.rsplit(':', 1)[1])
        print('Carregando dados fictícios e verificando migrações...', flush=True)
        load_fixture()
        print('Verificando NFC/QR fixos e preservação em duas recargas...', flush=True)
        verify_credential_reload()
        counts_sql = ("SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, passenger_id, vehicle_id, action, created_at))),0) FROM access_events; "
                      "SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, name, cpf))),0) FROM passengers; "
                      "SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, route_id, vehicle_id, driver_id, status))),0) FROM trips; "
                      "SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, passenger_id, token_hash, status))),0) FROM nfc_credentials; "
                      "SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, passenger_id, token_hash, status))),0) FROM qr_credentials;")
        before = mysql(counts_sql, 'app_db')
        child_env = os.environ.copy()
        child_env['DATABASE_URL'] = f'mysql+pymysql://root:{PASSWORD}@127.0.0.1:{port}/app_db?charset=utf8mb4'
        child_env['JWT_SECRET_KEY'] = 'temporary-secret-for-isolated-tests-only'
        child_env.pop('BUSGUARD_TEST_MYSQL_URL', None)
        for module in ('migrate_access_events_v1', 'migrate_trip_manifests_v2', 'migrate_trip_manifests_v2',
                       'migrate_nfc_credentials_v1', 'migrate_nfc_credentials_v1',
                       'migrate_qr_credentials_v1', 'migrate_qr_credentials_v1',
                       'migrate_route_endpoints', 'migrate_route_endpoints'):
            run([sys.executable, '-B', '-m', f'app.scripts.{module}'], env=child_env)
        if mysql(counts_sql, 'app_db') != before:
            raise RuntimeError('A migração alterou a contagem de registros.')

        print('Restaurando backup fictício em outro banco descartável...', flush=True)
        backup = run(['docker', 'exec', '-e', f'MYSQL_PWD={PASSWORD}', NAME, 'mysqldump', '-u', 'root',
                      '--single-transaction', '--no-tablespaces', 'app_db'], capture=True)
        mysql('CREATE DATABASE busguard_reliability_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
        run(['docker', 'exec', '-i', '-e', f'MYSQL_PWD={PASSWORD}', NAME, 'mysql', '-u', 'root',
             '--default-character-set=utf8mb4', 'busguard_reliability_test'], input_bytes=backup, capture=True)
        if mysql(counts_sql, 'busguard_reliability_test') != before:
            raise RuntimeError('As contagens do backup restaurado não conferem.')
        child_env['BUSGUARD_TEST_MYSQL_URL'] = f'mysql+pymysql://root:{PASSWORD}@127.0.0.1:{port}/busguard_reliability_test?charset=utf8mb4'
        print('Executando testes de API, permissões, conflitos e concorrência...', flush=True)
        run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], env=child_env)
        print('Verificando indisponibilidade real do banco descartável...', flush=True)
        run(['docker', 'stop', NAME], capture=True)
        started = False
        outage_check = ("from fastapi.testclient import TestClient; from app.main import app; "
                        "response=TestClient(app).get('/ready'); "
                        "assert response.status_code == 503, response.status_code; "
                        "assert response.json()['detail'] == 'Database unavailable'")
        run([sys.executable, '-B', '-c', outage_check], env=child_env)
        print('Verificações concluídas; backup fictício restaurado e testes aprovados.', flush=True)
    finally:
        if started:
            print('Removendo o contêiner descartável...', flush=True)
            subprocess.run(['docker', 'stop', NAME], stdout=subprocess.DEVNULL, check=False)


if __name__ == '__main__':
    main()
