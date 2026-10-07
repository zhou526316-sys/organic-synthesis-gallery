# Owner PDF fixture correction

Beijing time: 2026-10-07 14:20:14 +08:00

Context: strict browser verification after adding the independent owner PDF button.

Related implementation: `8e032f570e5bb5d49452fd337287a6e92b3c7b4c`
Related diagnostic workflow: `69b6ee0fe92e2aa8c892ff1fd978cd29fdbd5218`

原因已定位：这 5 条错误都来自测试脚本在新窗口的初始空白页读取 `localStorage`，触发了浏览器限制。原文和 PDF 打开动作已完成，测试请求也没有触达生产接口。我正在限定测试初始化的运行范围，然后保留零错误断言重新验证。
