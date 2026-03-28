"""Tool invocation results and errors."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class ToolResult:
    """Structured result returned to the model after a tool run."""

    ok: bool
    stdout: str
    stderr: str
    exit_code: int
    error_code: Optional[str] = None
    message: Optional[str] = None

    def to_json_str(self) -> str:
        payload: Dict[str, Any] = {
            "ok": self.ok,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
        }
        if self.error_code:
            payload["error_code"] = self.error_code
        if self.message:
            payload["message"] = self.message
        return json.dumps(payload, ensure_ascii=False)


class ToolInvocationError(Exception):
    """Validation or policy failure before execution."""

    def __init__(self, error_code: str, message: str):
        super().__init__(message)
        self.error_code = error_code
        self.message = message

    def to_tool_result(self) -> ToolResult:
        return ToolResult(
            ok=False,
            stdout="",
            stderr=self.message,
            exit_code=-1,
            error_code=self.error_code,
            message=self.message,
        )
