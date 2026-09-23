Beijing time: 2026-09-24 01:4x +08:00
Context: Explain why a webpage share button cannot directly open the WeChat friend picker
Summary: Clarified that a webpage button can configure WeChat share metadata and provide a direct sharing UX, but standard H5/JS-SDK cannot programmatically open WeChat's native friend selector. In WeChat, JS-SDK prepares title/description/image/link used by the native top-right share action. Outside WeChat, Web Share can open the system share sheet. A true one-tap WeChat friend picker requires a Mini Program/native-app integration, not a normal webpage.
Related main SHA: 0bf4ceabb1e2cb735ead57feb413a1898c2e30fc
