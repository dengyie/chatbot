# AGENTS.md

## 工作模式

- 派生子智能体（spawn_agent）后，主智能体MUST立即继续处理后续任务，不得阻塞等待子智能体返回。子智能体通知到达后再处理其结果。
- 使用 Subagent-Driven Development 模式时，任务间文档互不冲突的可并行派发，但需在各自完成后统一做集成验证。
