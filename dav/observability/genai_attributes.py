"""Optional OpenTelemetry Gen AI attributes (privacy-first: no prompts by default)."""

from __future__ import annotations

from typing import Any, Optional


def set_span_gen_ai_model(model: Optional[str]) -> None:
    """If OpenTelemetry is installed and a span is active, set gen_ai.request.model."""
    if not model:
        return
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span.is_recording():
            span.set_attribute("gen_ai.request.model", model)
    except Exception:
        pass


def set_span_gen_ai_operation(name: str) -> None:
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span.is_recording():
            span.set_attribute("gen_ai.operation.name", name)
    except Exception:
        pass


def tool_span_attributes(tool_name: str) -> dict[str, Any]:
    """Suggested attributes for tool.invoke spans (content-free)."""
    return {"gen_ai.tool.name": tool_name}
