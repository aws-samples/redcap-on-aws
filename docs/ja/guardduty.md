JP | [EN](../en/guardduty.md)

# Amazon GuardDutyの有効化

Amazon GuardDutyは、機械学習、異常検出や脅威インテリジェンスを使用して継続的に脅威を監視及び検出するサービスです。セキュリティの観点からAWSアカウントで有効化することを推奨しています。

> ### 注意
>
> 有効化設定はAWSアカウント毎に一度だけ必要です。
> そのため、既にご利用環境で有効化されている場合は設定不要です。

デフォルトでは有効化されていないため、有効化の際は[sst.config.ts](../../sst.config.ts)のSecurity stackを以下のようにコメントアウトしてデプロイしてください。

```sst.config.ts
/****** Stacks ******/
app.stack(Network);
app.stack(BuildImage);
app.stack(Database);
app.stack(Backend);
// Optional - enables AWS Guard-duty
app.stack(Security);  <- コメントアウト
```
