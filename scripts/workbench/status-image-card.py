from pathlib import Path
root=Path('.')
def edit(old,new):
 p=root/'src/user-ui/paper-actions.ts';s=p.read_text();assert s.count(old)==1,(old[:80],s.count(old));p.write_text(s.replace(old,new))
edit("const NAME = 'gallery-paper-actions';", "import { hydrateStatusImages, statusImageError, statusImageTag, viewStatusImage } from './status-image-assets';\n\nconst NAME = 'gallery-paper-actions';")
edit("active = false): string {\n  return `<button type='button' class='action shape-${style.shape}${active ? ' active' : ''}'", "active = false, original?: StyleDef): string {\n  return `<button type='button' aria-label='${escapeHtml(label)}' class='action shape-${style.shape}${active ? ' active' : ''}${original ? ' status-artwork' : ''}'")
edit("${icon(style, fallback)}<span>${escapeHtml(label)}</span></button>`;", "${original ? statusImageTag(original, 'status-original-action', label) : `${icon(style, fallback)}<span>${escapeHtml(label)}</span>`}</button>`;")
edit("  private feedbackMessage = '';", "  private feedbackMessage = '';\n  private imageMessage = '';\n  private imageBusy = false;")
edit("'status', '◈', Boolean(status))}", "'status', '◈', Boolean(status), status?.style.imageOriginal ? status.style : undefined)}")
edit("    this.bind();", "    this.bind();\n    hydrateStatusImages(this.shadow);")
edit("  private statusVisual(status: NonNullable<ReturnType<typeof store.status>>, className: string): string {", """  private statusVisual(status: NonNullable<ReturnType<typeof store.status>>, className: string): string {
    if (status.style.imageOriginal && status.style.imageData) {
      return `<span class='${className} status-original' title='${escapeHtml(statusLabel(status, this.language))}'>${statusImageTag(status.style, 'status-image', statusLabel(status, this.language))}</span>`;
    }""")
edit("    </style>${this.chips", """      .status-original{padding:2px!important;width:auto!important;max-width:128px;height:40px;min-height:0;background:transparent!important;border-radius:0;clip-path:none;transform:none}
      .status-original .status-image{width:auto;height:36px;max-width:124px;object-fit:contain;border-radius:0;background:transparent;transform:none}
      .action.status-artwork{clip-path:none;transform:none;width:100%;max-width:100%;padding:2px 5px}
      .status-original-action{display:block;width:100%;height:28px;object-fit:contain;transform:none}
      .status-style-editor .image-options{grid-column:1/-1;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .image-options label{display:flex;align-items:center;gap:4px}.image-options button{border:0;background:transparent;color:#3159bd;padding:4px}
      .image-help{grid-column:1/-1;line-height:1.5;overflow-wrap:anywhere}
    </style>${this.chips""")
edit("body = `<section class='section'><div class='stack'>${store.state.statuses.map(status => {", "body = `<section class='section'><div class='help' role='status' data-status-image-message>${escapeHtml(this.imageMessage)}</div><div class='stack'>${store.state.statuses.map(status => {")
edit("accept='image/png,image/jpeg,image/webp' data-status-image='${escapeHtml(status.id)}'", "accept='image/png,image/jpeg,image/webp,image/gif' ${this.imageBusy ? 'disabled' : ''} data-status-image='${escapeHtml(status.id)}'")
edit("          ${status.style.imageData ? `<button class='remove-image'", """          <div class='image-options'><label><input type='checkbox' data-status-crop='${escapeHtml(status.id)}'>${this.tr('静态裁切（可选）', 'Static crop (optional)')}</label>${status.style.imageData ? `<button type='button' data-action='view-status-image:${escapeHtml(status.id)}'>${this.tr('查看图片', 'View image')}</button>` : ''}</div>
          <div class='help image-help'>${this.tr('PNG / JPG / WebP / GIF，最大 30 MB。默认保留原图和动画，仅存在当前浏览器；账号同步预览图。静态裁切最大 20 MB。', 'PNG / JPG / WebP / GIF, up to 30 MB. Originals and animation stay in this browser; accounts sync a preview. Static crop: up to 20 MB.')}</div>
          ${status.style.imageData ? `<button class='remove-image'""")
