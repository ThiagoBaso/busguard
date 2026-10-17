class AgentError(Exception):
    """Erro esperado, registrado no relatório da execução."""


class ConfigurationError(AgentError):
    pass


class SafetyError(AgentError):
    pass


class ProviderError(AgentError):
    def __init__(self, message, *, process=None, metrics=None):
        super().__init__(message)
        self.process, self.metrics = process, metrics


class BudgetError(AgentError):
    pass
