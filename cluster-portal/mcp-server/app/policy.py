"""Policy engine for MCP tool execution.

Enforces explicit rules for:
- Identity verification
- Role-based access control
- Operator mode restrictions
- Risk level authorization
- Confirmation requirements
- Audit trail

Policy rules are evaluated in order. The first matching rule determines
the outcome (allow/deny/confirm).
"""
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum
from dataclasses import dataclass
import logging

from app.auth import MCPUser
from app.tools import RiskLevel, get_tool

logger = logging.getLogger("mcp.policy")


class PolicyDecision(str, Enum):
    """Possible policy outcomes."""
    ALLOW = "allow"
    DENY = "deny"
    CONFIRM = "confirm"
    DENY_OBSERVE = "deny_observe"


@dataclass
class PolicyRule:
    """A single policy rule."""
    name: str
    description: str
    condition: str  # Human-readable condition
    decision: PolicyDecision
    priority: int = 0  # Higher = evaluated first


@dataclass
class PolicyEvaluation:
    """Result of policy evaluation."""
    decision: PolicyDecision
    rule_name: str
    reason: str
    risk_level: Optional[str] = None
    requires_confirmation: bool = False


# ── Default policy rules ─────────────────────────────────────────────────

DEFAULT_RULES: List[PolicyRule] = [
    PolicyRule(
        name="observe_mode_read_only",
        description="OBSERVE mode allows only read operations",
        condition="mode == observe AND risk_level IN (read, low)",
        decision=PolicyDecision.ALLOW,
        priority=100,
    ),
    PolicyRule(
        name="observe_mode_deny_write",
        description="OBSERVE mode denies all write operations",
        condition="mode == observe AND risk_level IN (medium, high, critical)",
        decision=PolicyDecision.DENY_OBSERVE,
        priority=200,
    ),
    PolicyRule(
        name="read_risk_auto_allow",
        description="READ operations auto-allow for any authenticated user",
        condition="risk_level == read",
        decision=PolicyDecision.ALLOW,
        priority=10,
    ),
    PolicyRule(
        name="low_risk_auto_allow",
        description="LOW risk operations auto-allow for any authenticated user",
        condition="risk_level == low",
        decision=PolicyDecision.ALLOW,
        priority=20,
    ),
    PolicyRule(
        name="medium_risk_authorize",
        description="MEDIUM risk requires admin or developer role",
        condition="risk_level == medium AND role IN (admin, developer)",
        decision=PolicyDecision.ALLOW,
        priority=30,
    ),
    PolicyRule(
        name="medium_risk_deny_user",
        description="MEDIUM risk denies regular users",
        condition="risk_level == medium AND role == user",
        decision=PolicyDecision.DENY,
        priority=31,
    ),
    PolicyRule(
        name="high_risk_confirm",
        description="HIGH risk requires confirmation for admin/developer",
        condition="risk_level == high AND role IN (admin, developer)",
        decision=PolicyDecision.CONFIRM,
        priority=40,
    ),
    PolicyRule(
        name="high_risk_deny_user",
        description="HIGH risk denies regular users",
        condition="risk_level == high AND role == user",
        decision=PolicyDecision.DENY,
        priority=41,
    ),
    PolicyRule(
        name="critical_risk_confirm",
        description="CRITICAL risk requires confirmation for admin/developer",
        condition="risk_level == critical AND role IN (admin, developer)",
        decision=PolicyDecision.CONFIRM,
        priority=50,
    ),
    PolicyRule(
        name="critical_risk_deny_user",
        description="CRITICAL risk denies regular users",
        condition="risk_level == critical AND role == user",
        decision=PolicyDecision.DENY,
        priority=51,
    ),
]


class PolicyEngine:
    """Evaluates policy rules for MCP tool execution."""

    def __init__(self, rules: Optional[List[PolicyRule]] = None):
        self.rules = sorted(
            rules or DEFAULT_RULES,
            key=lambda r: r.priority,
            reverse=True,
        )

    def evaluate(
        self,
        user: MCPUser,
        tool_name: str,
        args: Dict[str, Any],
    ) -> PolicyEvaluation:
        """Evaluate policy for a tool execution request.

        Returns the first matching rule's decision.
        """
        tool = get_tool(tool_name)
        if not tool:
            return PolicyEvaluation(
                decision=PolicyDecision.DENY,
                rule_name="tool_not_found",
                reason=f"Tool '{tool_name}' not found",
            )

        risk_level = tool.get("risk_level", RiskLevel.READ)
        role = user.role
        mode = user.mode

        # Evaluate rules in priority order
        for rule in self.rules:
            if self._matches(rule, role, mode, risk_level):
                return PolicyEvaluation(
                    decision=rule.decision,
                    rule_name=rule.name,
                    reason=rule.description,
                    risk_level=risk_level.value,
                    requires_confirmation=rule.decision == PolicyDecision.CONFIRM,
                )

        # Default deny if no rule matches
        return PolicyEvaluation(
            decision=PolicyDecision.DENY,
            rule_name="default_deny",
            reason="No policy rule matched — default deny",
            risk_level=risk_level.value,
        )

    def _matches(
        self,
        rule: PolicyRule,
        role: str,
        mode: str,
        risk_level: RiskLevel,
    ) -> bool:
        """Check if a rule's condition matches the current context."""
        # Role matching first
        if "role == user" in rule.condition and role != "user":
            return False
        if "role IN (admin, developer)" in rule.condition and role not in ("admin", "developer"):
            return False

        # Mode matching
        if "mode == observe" in rule.condition and mode != "observe":
            return False
        if "mode == operate" in rule.condition and mode != "operate":
            return False

        # Risk level matching
        if "risk_level == read" in rule.condition and risk_level != RiskLevel.READ:
            return False
        if "risk_level == low" in rule.condition and risk_level != RiskLevel.LOW:
            return False
        if "risk_level == medium" in rule.condition and risk_level != RiskLevel.MEDIUM:
            return False
        if "risk_level == high" in rule.condition and risk_level != RiskLevel.HIGH:
            return False
        if "risk_level == critical" in rule.condition and risk_level != RiskLevel.CRITICAL:
            return False

        # Combined conditions (IN lists)
        if "risk_level IN (read, low)" in rule.condition:
            if risk_level not in (RiskLevel.READ, RiskLevel.LOW):
                return False
        if "risk_level IN (medium, high, critical)" in rule.condition:
            if risk_level not in (RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL):
                return False

        return True

    def get_policy_summary(self) -> Dict[str, Any]:
        """Return a summary of all policy rules."""
        return {
            "rules": [
                {
                    "name": rule.name,
                    "description": rule.description,
                    "condition": rule.condition,
                    "decision": rule.decision.value,
                    "priority": rule.priority,
                }
                for rule in self.rules
            ],
            "risk_levels": {
                "read": "automatic",
                "low": "automatic",
                "medium": "authorization required",
                "high": "confirmation required",
                "critical": "confirmation + additional policy",
            },
        }


# Global policy engine instance
policy_engine = PolicyEngine()


def check_policy(user: MCPUser, tool_name: str, args: Dict[str, Any]) -> PolicyEvaluation:
    """Convenience function to check policy for a tool execution."""
    return policy_engine.evaluate(user, tool_name, args)
