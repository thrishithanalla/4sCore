from contextvars import ContextVar
import uuid

_request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
_trace_id_ctx:   ContextVar[str | None] = ContextVar("trace_id",   default=None)
_actor_user_ctx: ContextVar[str | None] = ContextVar("actor_user_id", default=None)

def new_id() -> str: return str(uuid.uuid4())

def set_ids(request_id: str, trace_id: str):
    _request_id_ctx.set(request_id)
    _trace_id_ctx.set(trace_id)

def get_request_id() -> str | None: return _request_id_ctx.get()
def get_trace_id()   -> str | None: return _trace_id_ctx.get()

def set_actor_user(actor_user_id: str | None): _actor_user_ctx.set(actor_user_id)
def get_actor_user() -> str | None: return _actor_user_ctx.get()
