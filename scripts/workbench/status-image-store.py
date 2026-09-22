from pathlib import Path
root=Path('.')
def edit(path,old,new):
 p=root/path;s=p.read_text();assert s.count(old)==1,(path,old[:80],s.count(old));p.write_text(s.replace(old,new))
p='src/user-ui/shared.ts'
edit(p,"import { cropUserImage } from './image-cropper';", "import { cropUserImage } from './image-cropper';\nimport { prepareStatusImage, type OriginalStatusImage } from './status-image-assets';")
edit(p,"export interface StyleDef { rgb: RGB; shape: Shape; imageData?: string; }", "export interface StyleDef { rgb: RGB; shape: Shape; imageData?: string; imageOriginal?: OriginalStatusImage; }")
edit(p,"  async setImage(target: StyleDef, file: File): Promise<void> {", """  private readonly statusImageJobs = new Map<string, symbol>();
  async setOriginalStatusImage(target: StyleDef, file: File): Promise<boolean> {
    const statusId = this.state.statuses.find(item => item.style === target)?.id;
    if (!statusId) return false;
    const job = Symbol('status-image');
    this.statusImageJobs.set(statusId, job);
    const previousData = target.imageData;
    const previousId = target.imageOriginal?.id;
    const prepared = await prepareStatusImage(file);
    const live = this.status(statusId)?.style;
    // Newer selections/removal or a remote image replacement win over this load.
    if (this.statusImageJobs.get(statusId) !== job || !live || live.imageData !== previousData || live.imageOriginal?.id !== previousId) return false;
    const previous = { imageData: live.imageData, imageOriginal: live.imageOriginal };
    Object.assign(live, prepared);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      delete live.imageData;
      delete live.imageOriginal;
      if (previous.imageData !== undefined) live.imageData = previous.imageData;
      if (previous.imageOriginal !== undefined) live.imageOriginal = previous.imageOriginal;
      throw error;
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { scope: 'global' } }));
    return true;
  }
  clearImage(target: StyleDef): void {
    const statusId = this.state.statuses.find(item => item.style === target)?.id;
    if (statusId) this.statusImageJobs.set(statusId, Symbol('removed'));
    delete target.imageData;
    delete target.imageOriginal;
    this.save();
  }
  async setImage(target: StyleDef, file: File): Promise<void> {""")
edit(p,"    const cropped = await cropUserImage(file);", "    const job = Symbol('cropped-image');\n    if (statusId) this.statusImageJobs.set(statusId, job);\n    const cropped = await cropUserImage(file);\n    if (statusId && this.statusImageJobs.get(statusId) !== job) return;")
edit(p,"    liveTarget.imageData = cropped.imageData;", "    delete liveTarget.imageOriginal;\n    liveTarget.imageData = cropped.imageData;")
