from pathlib import Path
root=Path('.')
def edit(old,new):
 p=root/'src/user-ui/paper-actions.ts';s=p.read_text();assert s.count(old)==1,(old[:80],s.count(old));p.write_text(s.replace(old,new))
edit("""      try {
        await store.setImage(status.style, file);
      } finally {
        input.value = '';
      }""", """      const crop = this.shadow.querySelector<HTMLInputElement>(`input[data-status-crop="${CSS.escape(status.id)}"]`)?.checked;
      this.imageBusy = true;
      this.imageMessage = this.tr('正在保存图片…', 'Saving image…');
      this.render();
      try {
        if (crop) { await store.setImage(status.style, file); this.imageMessage = ''; }
        else {
          const saved = await store.setOriginalStatusImage(status.style, file);
          this.imageMessage = saved ? this.tr('原图已保存在当前浏览器；刷新后仍可显示。', 'Original saved in this browser and available after reload.') : this.tr('已取消，保留更新后的设置。', 'Cancelled; newer settings kept.');
        }
      } catch (error) { this.imageMessage = statusImageError(error); }
      finally { this.imageBusy = false; input.value = ''; this.render(); }""")
edit("    if (action.startsWith('clear-status-image:')) {", """    if (action.startsWith('view-status-image:')) {
      const status = store.status(action.slice('view-status-image:'.length));
      if (status) await viewStatusImage(status.style);
      return;
    }
    if (action.startsWith('clear-status-image:')) {""")
edit("        delete status.style.imageData;\n        store.save();", "        this.imageMessage = '';\n        store.clearImage(status.style);")
