CREATE TABLE cnh (
    id_cnh INT AUTO_INCREMENT PRIMARY KEY,
    id_condutor INT UNIQUE NOT NULL, -- Garante relação 1:1 (um condutor por CNH ativa)
    numero_registro VARCHAR(11) UNIQUE NOT NULL, -- O número de registro da CNH
    numero_espelho VARCHAR(10) UNIQUE NOT NULL, -- Número do espelho (canto inferior)
    categoria VARCHAR(5) NOT NULL, -- Ex: 'B', 'AB', 'AD', 'E'
    data_emissao DATE NOT NULL,
    data_validade DATE NOT NULL,
    data_primeira_habilitacao DATE NOT NULL,
    uf_emissao CHAR(2) NOT NULL, -- Estado emissor (Ex: 'SP')
    observacoes TEXT, -- Restrições médicas ou EAR (Ex: 'A', 'B', 'A exerce atividade remunerada')
    status_cnh ENUM('Ativa', 'Suspensa', 'Cassada', 'Vencida') DEFAULT 'Ativa',
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_condutor) REFERENCES condutores(id_condutor) ON DELETE CASCADE
);
