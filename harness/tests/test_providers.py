from inspect_ai.model._providers.providers import validate_anthropic_client


def test_anthropic_provider_dependencies_installed():
    """Real runs use Inspect's Anthropic provider, which needs the anthropic SDK (2.0+)."""
    validate_anthropic_client("Anthropic API")
