Beijing time: 2026-09-24 01:15 +08:00
Context: WeChat fixed-egress relay end-to-end verification
Summary: Relay health, DNS/HTTPS, GitHub relay configuration, and relay authentication are working. The live direct relay probe reached WeChat and returned errcode 40125 (invalid appsecret). User was instructed to correct the current server-side WeChat credential without sharing it in chat, restart the relay container, and keep the corresponding repository secret synchronized if the credential was reset. CI was tightened to fail closed on all WeChat JS-SDK signature errors.
Related commits:
- 5e21a4a63431d6642666bad5e4acfa4b6aecec48
- 5f944b9d6ac6bcc481fc854a17240d9c89879519
- 5f944b9d6ac6bcc481fc854a17240d9c89879519
