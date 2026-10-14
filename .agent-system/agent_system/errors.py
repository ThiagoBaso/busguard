class AgentError(Exception):
    """Erro esperado, registrado no relatório da execução."""


class ConfigurationError(AgentError):
    pass


class SafetyError(AgentError):
    pass


class ProviderError(AgentError):
    pass


class BudgetError(AgentError):
    pass
