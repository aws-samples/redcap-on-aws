[JP](../ja/ses.md) | EN

# Moving out of the Amazon SES Sandbox in your production environment

Amazon SES is placed in the sandbox in all new AWS Account to prevent fraud and abuse. In the sandbox, Amazon SES has some restrictions such as the maximum number per second and per 24 hour period. Please see the details as [the official document](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

For that reason, you need to request that Amazon SES in your account move out of the sandbox in the production environment. You can request it using either AWS management console or AWS CLI. Please check how to request as [the document](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
