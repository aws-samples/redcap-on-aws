[JP](../ja/waf.md) | EN

# AWS WAF

AWS WAF is a web application firewall that protect your applications from common web exploits and uses security rules to protect your traffic. This is enabled in every environment you deploy.

## Using an External WAF WebACL

You can use an existing AWS WAF WebACL instead of creating a new one. This is useful when you have a centrally managed WAF or need to share WAF rules across multiple applications.

To use an external WAF WebACL, configure the `externalResources.wafWebAcl` parameter in your `stages.ts` file with the ARN of your existing WebACL:

```ts
const dev: RedCapConfig = {
  ...baseOptions,
  // ... other configuration
  externalResources: {
    wafWebAcl:
      "arn:aws:wafv2:ap-northeast-1:123456789012:regional/webacl/my-webacl/a1b2c3d4-5678-90ab-cdef-EXAMPLE11111",
  },
};
```

**Important Notes:**

- When using `externalResources.wafWebAcl`, the `allowedIps` and `allowedCountries` parameters will be **ignored**
- You must configure all WAF rules (including IP filtering, rate limiting, etc.) directly in your external WebACL
- The external WebACL must be in the same region as your REDCap deployment
- Ensure the WebACL is configured with appropriate rules for your security requirements

If `externalResources.wafWebAcl` is not specified, the deployment will create a new WAF WebACL with the default rules described below, along with any configured `allowedIps` and `allowedCountries` settings.

## Internal WAF Configuration

When not using an external WAF WebACL, the deployment creates a new WAF with the following configurations:

### IP filtering

To improve your security posture, we recommend limiting the access to your REDCap application from a list of knows IPs (e.g. our campus CIDR) with AWS WAF. To add one or more CIDR addresses configure the `allowedIps` parameter in the `stages.ts` file.

```ts
allowedIps: ['118.1.0.0/24'],
```

### AWS Managed rules

AWS WAF managed rules protect your applications against common application vulnerabilities or other unwanted traffic. This project implemented the following rules from `Baseline rule groups`, `IP reputation rule groups` and `Use-case specific rule groups` in [Waf.ts](../../prototyping/constructs/Waf.ts). Please check the [AWS WAF rules documentation](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rules.html) if you need.

- AWSManagedRulesCommonRuleSet
- AWSManagedRulesKnownBadInputsRuleSet
- AWSManagedRulesSQLiRuleSet
- AWSManagedRulesAmazonIpReputationList

### Custom rules

#### Rate control

A rate-based rule counts incoming requests and rate limits requests when they are coming at too fast a rate. The rate-based rule in [Waf.ts](../../prototyping/constructs/Waf.ts) prevents clients to flood your service if they execute more than 3000 request in 30 seconds.

#### Secret base access control

This is a control access for `cron.php` in REDCap. Please check [cron documentation](../en/cron.md)

#### Example to add new rules

If you want to restrict access using combination of URL-path based and rate limit, you can write:

```ts
  // This waf rule is an example of a rate limit on the specific path of url. In practice, it does not make much sense because REDCap will render the login UI at any URL when you are not logged in.
  {
    name: 'rate-limit-specific-url',
    rule: {
      name: 'rate-limit-specific-url',
      priority: 50,
      statement: {
        rateBasedStatement: {
          limit: 100,
          aggregateKeyType: 'IP',
          scopeDownStatement: {
            byteMatchStatement: {
              fieldToMatch: {
                uriPath: {},
              },
              positionalConstraint: 'EXACTLY',
              searchString: '/',
              textTransformations: [
                {
                  type: 'NONE',
                  priority: 0,
                },
              ],
            },
          },
        },
      },
      action: {
        block: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'rate-limit-specific-url',
      },
    },
  },
```

This is an example of an IP-based rate limit of 100 per 5 minutes for the `/` path.
This is useful for more robust rate limiting on login pages or some important pages, but not really useful in practice, since REDCap will display the login screen for any URL that is not logged in.
