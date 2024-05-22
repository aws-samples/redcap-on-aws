JP | [EN](../en/build.md)

# ビルドプロセス

本プロジェクトでは、REDCap アプリケーションを Docker コンテナとして動作させています。
AWS アカウントに REDCap のアプリケーションコードがアップロードされると、それが動作するコンテナイメージを作成し、Amazon Elastic Container Repository(ECR)に保存します。
AWS App Runner がそれをもとにコンテナを実行することで、REDCap アプリケーションが動作します。
このページでは、ビルドプロセスの詳細について順を追って説明します。

## deploy コマンドの実行

まず、ユーザーは`yarn deploy --stage <your_stage_name>`コマンドを実行します。
このコマンドは、実際には`sst deploy`を実行し、その中で`cdk deploy`が実行されます。`cdk deploy`コマンドは、AWS CDK(Cloud Development Kit)のコマンドで、定義された一連の AWS リソースをデプロイすることを指示します。この後の工程は全てこのプロセスの一部としてトリガーします。

## AWS CodeBuild によるビルドの実行

`deploy` が実行されると、その中で AWS CodeBuild プロジェクトが作成されます。これは、REDCap 用の Docker Image を作成するための一連の手続きを実行するためのものです。その後、AWS CDK の Trigger(内部では AWS Lambda が動作します)が、AWS CodeBuild の`StartBuild`を実行します。これにより、Docker Image が作成され、ECR に `latest`タグで Push されます。

## App Runner への自動デプロイ

このプロジェクトでデプロイされる App Runner では、`autoDeployment` プロパティを有効に設定しています。この機能を有効化することで、デプロイ元となっている ECR レポジトリの `latest` が更新された際、それを検知して自動的に再度デプロイを行います。

### ビルドプロセスの再実行

AWS マネジメントコンソールまたは AWS CLI を用いてビルドプロセスを再実行することができます。

#### 1. AWS マネジメントコンソール

AWS マネジメントコンソールを用いて再実行を行う場合、[CodeBuild](https://ap-northeast-1.console.aws.amazon.com/codesuite/codebuild/projects)にアクセスします。ページ内でデプロイされたプロジェクトを見つけて選択し、上の`Start build`ボタンを押します。

![codeBuild](../images/codeBuild.png)

#### 2. AWS CLI

初めに AWS CLI がインストールされていることを確認してください。

```sh
aws --version
```

デプロイ完了時に `UpdateDeploymentCommand`として表示されるコマンドを実行してください。

```sh
✔  Deployed:
   Network
   BuildImage
   UpdateDeploymentCommand: aws lambda invoke --function-name <function-name> --region <region> --profile <profile> deployLambdaResponse.json
   ...
```

**注**: `dev` 環境 (例: `sst dev ...`) で実行している場合は、AWS lambda 呼び出しを実行する前にコマンドが実行されていることを確認してください。
