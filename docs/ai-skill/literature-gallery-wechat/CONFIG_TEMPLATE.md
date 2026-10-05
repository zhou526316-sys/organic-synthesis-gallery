# 配置模板

不要在公开仓库填真实 Secret。

~~~yaml
project:
  name: my-literature-gallery
  timezone: Asia/Shanghai
  production_release_time: "08:00"

repository:
  provider: github
  repo: "<owner/repo>"
  branch: main
  pages: true
  custom_domain: "<optional>"

literature:
  scope: "<scientific scope>"
  primary_review_days: 3
  machine_safety_tail_days: 7
  journals:
    - name: "<Journal>"
      issns: ["<ISSN>"]
      active_from: "YYYY-MM-DD"

media:
  enabled: false
  browser_bridge: tampermonkey
  institution_access_required: false
  public_media_storage: "<r2-or-other>"
  private_pdf_enabled: false

wechat:
  enabled: false
  author_name: "<公众号署名>"
  default_mode: draft_only
  final_send_requires_human: true

secret_names:
  github: GITHUB_TOKEN
  cloudflare_account: CLOUDFLARE_ACCOUNT_ID
  r2_access_key: R2_ACCESS_KEY_ID
  r2_secret_key: R2_SECRET_ACCESS_KEY
  wechat_app_id: WECHAT_APP_ID
  wechat_app_secret: WECHAT_APP_SECRET
~~~
