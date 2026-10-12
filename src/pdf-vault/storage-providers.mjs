// Presentation hints for choosing a *local filesystem folder*. These are
// official onboarding links, NOT OAuth integrations or remote storage access.
export const PDF_FOLDER_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'local', name: '本机文件夹', officialUrl: '',
    summary: '选择电脑上已有的 PDF 文件夹。',
    steps: '点击下方按钮，选中电脑中的 PDF 文件夹并允许此网站读取。以后将出版社 PDF 保存到同一目录。',
  }),
  Object.freeze({
    id: 'baidu', name: '百度网盘', officialUrl: 'https://yun.baidu.com/download',
    summary: '先到百度官方登录或安装客户端，再选择真正保存在电脑上的文件夹。',
    steps: '在百度网盘官方客户端登录，按客户端实际功能选择本地同步或下载目录。确认 PDF 已下载到电脑后，在下方选择对应文件夹。自动备份与双向同步可能不同。',
  }),
  Object.freeze({
    id: 'quark', name: '夸克网盘', officialUrl: 'https://pan.quark.cn/',
    summary: '先在夸克官方页面登录或安装客户端，再选择本机实际保存的 PDF 目录。',
    steps: '在夸克官方客户端登录，根据版本使用本地同步、离线可用或下载功能。只选择已经能从电脑文件管理器直接打开 PDF 的目录。',
  }),
  Object.freeze({
    id: 'aliyun', name: '阿里云盘', officialUrl: 'https://www.aliyundrive.com/download',
    summary: '先通过阿里云盘官方客户端登录，随后选择已下载或同步到电脑的目录。',
    steps: '在阿里云盘官方客户端登录，确认相应 PDF 已同步或下载到本机，再从下方选择该文件夹。网页端的纯云端文件不等于本地可读文件。',
  }),
  Object.freeze({
    id: 'onedrive', name: 'OneDrive', officialUrl: 'https://www.microsoft.com/zh-cn/microsoft-365/onedrive/download',
    summary: '先在微软官方 OneDrive 客户端登录，再选择 Windows 文件管理器里的同步目录。',
    steps: '在 Windows OneDrive 中登录后选择同步目录；如果文件为“仅联机”，先将相应 PDF 设置为始终保留在此设备，确保本地存在完整字节。',
  }),
]);
const BY_ID = new Map(PDF_FOLDER_PROVIDERS.map(provider => [provider.id, provider]));
export const PDF_FOLDER_PROVIDER_IDS = Object.freeze(PDF_FOLDER_PROVIDERS.map(item => item.id));

export function getPdfFolderProvider(id) {
  return BY_ID.get(id) || BY_ID.get('local');
}

export function isPdfFolderProvider(id) {
  return typeof id === 'string' && BY_ID.has(id);
}
