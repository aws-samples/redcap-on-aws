JP | [EN](../en/ses.md)

# 本番環境でのAmazon SESサンドボックス外への移動

不正利用や悪用防止の観点から、全ての新しいAWSアカウントではAmazon SESはサンドボックに配置されます。サンドボックス環境では、Amazon SESは制限がかかっています。例えば、秒間あたりまたは、24時間あたりの最大メッセージ数。制限の詳細については、[公式ドキュメント](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)を参照ください。

上記の理由から、本番環境利用時は、ご自身のアカウントのAmazon SESをサンドボックス外に移動するリクエストを行なってください。リクエストに関しては、AWSマネージメントコンソールまたは、AWS CLIから実施可能です。リクエストの詳細については、[本ドキュメント](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)を確認ください。
