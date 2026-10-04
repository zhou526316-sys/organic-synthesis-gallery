Beijing time: 2026-10-04 14:20 +08:00
Context: User's Ubuntu server returned "fatal: not a git repository" and could not find ops/wechat-publisher/create-draft.py from /home/ubuntu.

Diagnosis:
- Current shell is /home/ubuntu.
- Existing relay service may be installed/running independently.
- Avoid modifying or replacing the live relay directory.
- Safest path is a separate fresh clone in the user's home directory and run the publisher from there; it can still read /etc/osg-wechat-relay/env.

User-visible reply:

这是路径问题，不是微信接口问题。你当前在 `/home/ubuntu`，而服务器上原先用于 relay 的目录没有被当前 shell 识别为完整 Git 仓库，所以 `git pull` 和相对脚本路径都失败了。

为了**不影响现在已经正常运行的微信 relay**，我们不要动 `/opt/osg-wechat-relay` 或 Docker。直接单独克隆一份发布器代码。

在 Ubuntu 里整段执行：

```bash
cd "$HOME"

if [ -d "$HOME/organic-synthesis-gallery-publisher/.git" ]; then
  cd "$HOME/organic-synthesis-gallery-publisher"
  git pull --ff-only
else
  git clone https://github.com/zhou526316-sys/organic-synthesis-gallery.git "$HOME/organic-synthesis-gallery-publisher"
  cd "$HOME/organic-synthesis-gallery-publisher"
fi

pwd
test -f ops/wechat-publisher/create-draft.py && echo "PUBLISHER SCRIPT OK"
```

正常最后应该看到类似：

```text
/home/ubuntu/organic-synthesis-gallery-publisher
PUBLISHER SCRIPT OK
```

然后执行预览：

```bash
sudo python3 "$HOME/organic-synthesis-gallery-publisher/ops/wechat-publisher/create-draft.py"
```

这一步依然**不会创建公众号草稿，也不会发布**，只是生成本地预览并输出 JSON。

如果成功，最后应该出现 `"stage": "preview"`、`"paper_count": 5` 以及本批 5 个 DOI。

把最后那行 JSON 发给我。

如果第一段 `git clone` 本身报错，把完整报错发来；不要删除或重装现有 relay。