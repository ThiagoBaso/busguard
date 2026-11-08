"""Notifica clientes administrativos sobre alterações confirmadas nesta instância."""

import asyncio
import threading


class ChangeBroker:
    def __init__(self):
        self._lock = threading.Lock()
        self._subscribers = set()

    def subscribe(self):
        subscriber = (asyncio.get_running_loop(), asyncio.Queue(maxsize=1))
        with self._lock:
            self._subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber):
        with self._lock:
            self._subscribers.discard(subscriber)

    @staticmethod
    def _enqueue(queue, tables):
        if not queue.empty():
            tables = tables | queue.get_nowait()
        queue.put_nowait(tables)

    def publish(self, tables):
        with self._lock:
            subscribers = tuple(self._subscribers)
        for loop, queue in subscribers:
            try:
                loop.call_soon_threadsafe(self._enqueue, queue, set(tables))
            except RuntimeError:
                self.unsubscribe((loop, queue))


broker = ChangeBroker()
