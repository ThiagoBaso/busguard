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
        run(['docker', 'exec', '-i', '-e', f'MYSQL_PWD={PASSWORD}', NAME, 'mysql', '-u', 'root',
             '--default-character-set=utf8mb4'], input_bytes=(ROOT / 'database' / 'init.sql').read_bytes(), capture=True)
        counts_sql = ("SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, passenger_id, vehicle_id, action, created_at))),0) FROM access_events; "
                      "SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, name, cpf))),0) FROM passengers; "
                      "SELECT COUNT(*), COALESCE(SUM(CRC32(CONCAT_WS('|', id, route_id, vehicle_id, driver_id, status))),0) FROM trips;")
        before = mysql(counts_sql, 'app_db')
        child_env = os.environ.copy()
        child_env['DATABASE_URL'] = f'mysql+pymysql://root:{PASSWORD}@127.0.0.1:{port}/app_db?charset=utf8mb4'
        child_env['JWT_SECRET_KEY'] = 'temporary-secret-for-isolated-tests-only'
        child_env.pop('BUSGUARD_TEST_MYSQL_URL', None)
        for module in ('migrate_access_events_v1', 'migrate_trip_manifests_v2', 'migrate_trip_manifests_v2'):
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
