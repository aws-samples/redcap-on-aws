[JP](../ja/ptp.md) | EN

# Path to production

1. If you don't know the number of users and load on the system, be sure to start with reasonable App Runner scaling values that allow the service to scale. Later you can tune this values to save some cost, like minimizing `minSize` for `warm` instances. Each instance you reduce is around 7 USD. `maxSize` is also important for cost control and budget, that can be tuned with time and some system usage.

2. REDCap is very CPU intensive. The default setting is to use 2 vCPU for each instance, but under REDCap operations that can take a lot of CPU time, it might be recommended to scale to a 4vCPU/8GB configuration. This is also something to monitor after some system usage.

3. Upgrading REDCap. The project intentionally configures this a series of steps to avoid a system downtime or data loss. We recommend to assign a person to execute this steps each time REDCap needs to be upgraded.

4. The main data storage of REDCap are the database and S3. Amazon RDS Aurora V2 has several backup and disaster recovery options enabled for the `prod` deployment, like the 24 hours backtracking. On the other side, S3 has a great reliability, but it does not make backup or keep history of your files by default. By default (while deploying `prod`) in this project, `versioning` will be enabled. You can disable it in the [Backend.ts](../../stacks/Backend.ts) construct when creating the REDCap's application bucket:

   ```ts
   ...bucketProps(app.stage === 'prod'), // versioning enabled
   ```

   ```ts
   ...bucketProps(false), // versioning disabled
   ```

5. During this time (January 2024), the CDK and Cloudformation do not support the creation of custom domain for App Runner. In this project, a workaround is implemented to support this feature. When the support is release (<https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1092>), it is recommended to refactor this feature.

6. SST is an open source project and they improve it by collecting anonymous data of your machine information (not AWS related). However you can disable it: <https://docs.sst.dev/anonymous-telemetry>

7. Keep SST up to date. To upgrade SST and CDK execute the following:

   1. `yarn sst update <version> --stage <your_stage>` any stage will work

   2. `yarn install`

8. There are a few endpoints in REDCap that are accessed without authorization, like `install.php`, `upgrade.php`, `cron.php`. The last one, `cron.php` is already protected by WAF and EventBridge with a secret that only these two entities know. This endpoint triggers many functions, so it is a good candidate to protect first in the prototype. However, if you are not using WAF, it is recommended to add the same strategy to protect any other public endpoints that trigger some server action that should not be public.

9. Activate Amazon GuardDuty for Amazon S3, Amazon RDS and AWS Lambda services used in this project. The CDK automatically is enabling GuardDuty service, but you have to manually check to enable it these three specific services in the AWS Console. When CloudFormation support is added (<https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-guardduty-detector-cfndatasourceconfigurations.html>), you can enable these services via CDK.

10. REDCap's IAM user access keys should be rotated for S3 and email services with Amazon SES. The required configuration for REDCap is to provided AWS access keys for these services, it is recommended to move this authorization to IAM base access policies. [More info - IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)

11. Database authentication using IAM instead of user and password. Removing password access increase your security posture to prevent that this password is leaked. For production, it is recommended to test if this approach would work with REDCap's connection code base. This approach is generally transparent or with minimal changes to the application. [More info - IAM DB Auth](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html).

12. REDCap's code base review. The system now has the ability to allow outbound external communications, this means that REDCap's servers can communicate with an Internet service. Some features of REDCap depends on this to work, like short-url, so this is why this is the default. However, sharing the stats or allowing your server to communicate to external servers is a possible backdoor to leak your secret credentials stored in the database. This is why is important to track code changes and code validation that REDCap's code is preventing that these secrets are never transmitted.

13. Aurora database is deployed with default settings that works for most applications and changing these settings takes advance knowledge of MySQL and Aurora. REDCap configuration check will throw a warning regarding some parameters, but we recommend to change these if you really see performance issues. You can visit to these docs for more information [Best practices on Aurora](https://aws.amazon.com/blogs/database/best-practices-for-amazon-aurora-mysql-database-configuration/) and [Create parameter group on CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.ParameterGroupProps.html)

If you want to prevent the warning messages, you can add the code below to [Database.ts](../../stacks/Database.ts) and configure it according to REDCap. However, this is not recommended by Amazon Aurora, and if there is no problem, it is recommended to use Amazon Aurora's default values.
When you change the parameter group, please restart the DB to reflect the settings in the DB after changing the settings and deploying. Please refer to [here](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/USER_RebootCluster.html) for details on restarting.

```ts
parameterGroupParameters: {
        // Avoid the REDCap system warning. Please change to the required value
        max_allowed_packet: '1073741824',
        read_rnd_buffer_size: '262144',
        sort_buffer_size: '2097152',
},
```

Alternatively, you can configure your `stages.ts` in the `db` object to set the `maxAllowedPacket: '1073741824'` to the
