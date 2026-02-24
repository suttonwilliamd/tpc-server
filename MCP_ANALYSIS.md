# MCP Analysis: Problems and Solutions

## Executive Summary

This document analyzes Anthropic's new MCP (Model Context Protocol) features and Theo's critique to understand the key problems with current MCP implementations and the proposed solutions. The analysis covers context bloat, inefficiency in tool calling workflows, accuracy issues, and the three proposed solutions: Tool Search Tool, Programmatic Tool Calling, and Tool Use Examples.

## 1. Context Bloat Problem

### The Problem
- **Token Overhead**: Current MCP implementations require loading all tool definitions upfront, consuming massive context windows
- **Example**: A 5-server setup (GitHub, Slack, Sentry, Grafana, Splunk) consumes ~55K tokens before any actual work begins
- **Extreme Cases**: Anthropic has seen tool definitions consume up to 134K tokens
- **Impact**: Reduces available context for actual task execution, increases costs, and degrades model performance

### Theo's Perspective
- **Dictionary Analogy**: "MCP works by making you read every single definition from the first word on the first page until you get where you want to be"
- **Performance Impact**: "If you bloat an agent with all of this MCP context that it doesn't need for the task it's executing, you made it more expensive, slower, and dumber"
- **Server Requirements**: "MCP effectively requires a full server... you want to run your MCP stuff on serverless? Good luck"

## 2. Inefficiency of Traditional Tool Calling Workflows

### The Problem
- **Context Pollution**: Intermediate results (e.g., 10MB log files, full database records) accumulate in context
- **Inference Overhead**: Each tool call requires a full model inference pass
- **Multi-step Inefficiency**: Complex workflows require multiple round-trips, each adding to context bloat

### Theo's Perspective
- **Restaurant Analogy**: Traditional approach is like getting boiled eggs with shells still on, requiring multiple back-and-forths
- **Failure Rates**: Models have 10-40% failure rates when processing large datasets vs. 0% with code-based filtering
- **Cost Analysis**: "Every single thing in your dictionary has to be read every single time you do anything"

## 3. Accuracy Issues with Tool Selection and Parameter Usage

### The Problem
- **Tool Selection Errors**: Models frequently choose wrong tools, especially with similarly named tools
- **Parameter Misuse**: JSON schemas define structure but not usage patterns, conventions, or parameter correlations
- **Format Ambiguities**: Unclear conventions for dates, IDs, nested structures lead to malformed calls

### Theo's Perspective
- **Real-world Example**: "I've even seen dumb things like models not switching to the right directory because they hallucinated the word work tree into something else"
- **API Conventions**: "When should Claude populate reporter.contact? How do escalation.level and escalation.sla_hours relate to priority?"
- **Model Limitations**: "These models don't behave well with large amounts of context... 40% lookup failure rate with large amounts of data"

## 4. Proposed Solutions

### A. Tool Search Tool

**Concept**: Dynamic tool discovery instead of upfront loading

**Benefits**:
- 85% reduction in token usage (from 77K to 8.7K tokens in examples)
- Preserves 95% of context window
- Improved accuracy: Opus 4 from 49% to 74%, Opus 4.5 from 79.5% to 88.1%

**Implementation**:
```json
{
  "tools": [
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
    {
      "name": "github.createPullRequest",
      "defer_loading": true
    }
  ]
}
```

**Theo's Critique**:
- "Adding one additional turn because we have to look up the tools"
- "Potentially really easy to hijack... prompt injections where I can add a fake tool"
- "This doesn't break prompt caching... actually a good call out"

### B. Programmatic Tool Calling

**Concept**: Code-based tool orchestration instead of natural language tool calls

**Benefits**:
- 37% token reduction on complex tasks
- Eliminates intermediate inference passes
- Reduces failure rates from 10-40% to 0% for data processing
- Enables parallel tool execution

**Implementation Example**:
```python
team = await get_team_members("engineering")
expenses = await asyncio.gather(*[
    get_expenses(m["id"], "Q3") for m in team
])
```

**Theo's Critique**:
- "This is what we discussed in the previous video where you can write code to execute the tools"
- "Models are so much smarter when you let them write code"
- "Anthropic should stop doing everything in Python... TypeScript is really good for this"
- "This adds a code execution step... extra overhead pays off when token savings are substantial"

### C. Tool Use Examples

**Concept**: Concrete usage examples instead of just JSON schemas

**Benefits**:
- Improved accuracy from 72% to 90% on complex parameter handling
- Clarifies format conventions, nested structures, and parameter correlations
- Shows realistic usage patterns

**Implementation Example**:
```json
{
  "name": "create_ticket",
  "input_examples": [
    {
      "title": "Login page returns 500 error",
      "priority": "critical",
      "reporter": {
        "id": "USR-12345",
        "contact": {"email": "jane@acme.com"}
      }
    }
  ]
}
```

**Theo's Critique**:
- "This is kind of sad... literally just here is a valid tool call you could do here"
- "Maybe we should just go back to writing code, guys"
- "It's all starting to feel like a mistake"

## 5. Trade-offs and Implementation Challenges

### Tool Search Tool Challenges
- **Latency**: Adds search step before tool invocation
- **Security**: Potential for prompt injection attacks
- **Discovery Accuracy**: Depends on good tool naming/descriptions
- **Cache Complexity**: Dynamic tool loading could break prompt caching

### Programmatic Tool Calling Challenges
- **Execution Overhead**: Requires code execution environment
- **Language Choice**: Python vs. TypeScript performance differences
- **Return Format Standardization**: MCP lacks output schema standards
- **Sandbox Requirements**: Need secure execution environments

### Tool Use Examples Challenges
- **Token Cost**: Examples add to tool definition size
- **Maintenance**: Examples need to stay current with API changes
- **Complexity**: Adds another layer to tool definitions
- **Discovery vs. Examples**: Contradictory approaches to tool usage

## 6. Theo's Specific Criticisms

### Fundamental Issues
- **"Duct tape to a bad standard"**: Solutions feel like workarounds
- **"Layer upon layer"**: Increasing complexity without solving root problems
- **"Reinventing operating systems"**: Over-engineering simple tool calls

### Implementation Concerns
- **"MCP sucks to implement on the server side"**
- **"Assuming a stateful long connection"**
- **"No one knows how to implement it because it sucks"**

### Industry Perspective
- **"ACP is a way better protocol than MCP"**
- **"Anthropic should acquire Zed"**
- **"Zed would never have let this fly"**

## 7. Strategic Recommendations

### When to Use Each Feature

**Tool Search Tool**:
- Tool definitions >10K tokens
- Large tool libraries (10+ tools)
- Multi-server MCP systems
- Tool selection accuracy issues

**Programmatic Tool Calling**:
- Large dataset processing
- Multi-step workflows (3+ tools)
- Filtering/transforming results
- Parallel operations
- Tasks where intermediate data shouldn't influence reasoning

**Tool Use Examples**:
- Complex nested structures
- Tools with many optional parameters
- Domain-specific conventions
- Similar tools needing disambiguation

### Implementation Strategy
1. **Start with biggest bottleneck**: Address specific constraints first
2. **Layer features strategically**: Combine complementary approaches
3. **Focus on tool discovery**: Clear naming and descriptions improve search accuracy
4. **Document return formats**: Critical for programmatic tool calling
5. **Use realistic examples**: Show variety of usage patterns

## 8. Conclusion

Anthropic's new MCP features represent significant improvements over traditional implementations, addressing the core problems of context bloat, inefficiency, and accuracy. However, Theo's critique highlights that these solutions may be treating symptoms rather than root causes. The proposed solutions offer:

- **Tool Search Tool**: 85% token reduction with dynamic discovery
- **Programmatic Tool Calling**: 37% token savings with code-based orchestration
- **Tool Use Examples**: 25% accuracy improvement on parameter handling

The trade-offs between latency, complexity, and effectiveness must be carefully considered. While these features make MCP more viable for complex agent workflows, the fundamental question remains whether MCP itself is the right architectural approach or if alternative protocols like ACP might offer simpler, more effective solutions.

## Appendix: Key Metrics

| Feature | Token Savings | Accuracy Improvement | Best Use Case |
|---------|--------------|----------------------|---------------|
| Tool Search Tool | 85% reduction | Opus 4: 49%→74% | Large tool libraries |
| Programmatic Tool Calling | 37% reduction | 10-40%→0% failure rate | Data processing |
| Tool Use Examples | N/A | 72%→90% | Complex parameters |

## References

- Anthropic Developer Platform Documentation
- Theo's MCP Critique Video
- Internal Anthropic Testing Results
- AutoCode Benchmark (Tencent Research)
- LLMVM Research