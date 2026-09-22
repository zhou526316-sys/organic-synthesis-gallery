from pathlib import Path
root=Path('.')
def edit(old,new):
 p=root/'src/user-ui/library-shell.ts';s=p.read_text();assert s.count(old)==1,(old[:80],s.count(old));p.write_text(s.replace(old,new))
edit("const NAME = 'gallery-user-shell';", "import { hydrateStatusImages, statusImageError, statusImageTag, viewStatusImage } from './status-image-assets';\n\nconst NAME = 'gallery-user-shell';")
edit("? `<img src='${escapeHtml(style.imageData)}' alt=''>`", "? statusImageTag(style, 'style-image', label)")
edit("accept='image/png,image/jpeg,image/webp' data-image='${prefix}'", "accept='${prefix.startsWith('status:') ? 'image/png,image/jpeg,image/webp,image/gif' : 'image/png,image/jpeg,image/webp'}' data-image='${prefix}'")
edit("${style.imageData ? `<button class='link danger' type='button' data-action='clear-image:${prefix}'>× image</button>` : ''}</div>`;", """${style.imageData ? `<button class='link danger' type='button' data-action='clear-image:${prefix}'>× image</button>` : ''}${prefix.startsWith('status:') ? `<label><input type='checkbox' data-image-crop='${prefix}'>静态裁切 / Static crop</label>${style.imageData ? `<button class='link' type='button' data-action='view-image:${prefix}'>查看图片 / View image</button>` : ''}` : ''}</div>`;""")
edit("  private integrationMessage = '';", "  private integrationMessage = '';\n  private imageMessage = '';")
edit("    this.bind();", "    this.bind();\n    hydrateStatusImages(this.shadow);")
edit("<h4>${this.tr('阅读状态', 'Reading status')}</h4><div class='manage'>", """<h4>${this.tr('阅读状态', 'Reading status')}</h4><div class='help'>${this.tr('原图 / GIF 最大 30 MB，默认不裁切。原图和动画仅保存在当前浏览器，账号同步预览图；静态裁切最大 20 MB。', 'Original / GIF up to 30 MB, no cropping by default. Originals and animation stay in this browser; accounts sync a preview. Static crop up to 20 MB.')}</div><div class='help' role='status' data-status-image-message>${escapeHtml(this.imageMessage)}</div><div class='manage'>""")
edit("""      try {
        await store.setImage(target, file);
      } finally {
        input.value = '';
      }""", """      const key = input.dataset.image || '';
      const crop = this.shadow.querySelector<HTMLInputElement>(`input[data-image-crop="${CSS.escape(key)}"]`)?.checked;
      input.disabled = true;
      try {
        if (key.startsWith('status:') && !crop) {
          const saved = await store.setOriginalStatusImage(target, file);
          this.imageMessage = saved ? this.tr('原图已保存在当前浏览器。', 'Original saved in this browser.') : this.tr('已取消，保留更新后的设置。', 'Cancelled; newer settings kept.');
        } else { await store.setImage(target, file); this.imageMessage = ''; }
      } catch (error) { this.imageMessage = statusImageError(error); }
      finally { input.disabled = false; input.value = ''; this.render(); }""")
edit("    if (action.startsWith('clear-image:')) { const target = this.styleTarget(action.slice(12)); if (target) { delete target.imageData; store.save(); } return; }", """    if (action.startsWith('view-image:')) { const target = this.styleTarget(action.slice(11)); if (target) await viewStatusImage(target); return; }
    if (action.startsWith('clear-image:')) { const target = this.styleTarget(action.slice(12)); if (target) { this.imageMessage = ''; store.clearImage(target); } return; }""")
edit("class='style-preview shape-${style.shape}'", "class='style-preview shape-${style.shape}${style.imageOriginal ? ' status-original-preview' : ''}'")
edit('    </style><button', '      .style-preview.status-original-preview{width:96px;height:40px;clip-path:none;transform:none;border-radius:0;background:transparent;overflow:visible}\n    </style><button')
p=root/'tests/mobile-interaction.spec.ts';s=p.read_text();needle='  await statusImageInput.setInputFiles(';assert s.count(needle)==3
s=s.replace(needle,'  // Original/GIF display is the default; legacy cropping is now explicit.\n  await userShell.locator(\'input[data-image-crop="status:to-read"]\').check();\n'+needle);p.write_text(s)
