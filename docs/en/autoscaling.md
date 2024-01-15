[JP](../ja/autoscaling.md) | EN

# App Runner AutoScaling Setting

In this project, we use AWS App Runner to host REDCap. This section describes scaling configuration in App Runner.

## App Runner AutoScaling Parameters

| Parameter       | Property in stage      | Description                                                                                                                                                                                                                                                                                                                   | How to decide                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Max Concurrency | `appRunnerConcurrency` | The maximum number of concurrent requests that an instance processes. When the number of concurrent requests exceeds this quota, App Runner scales up the service.                                                                                                                                                            | To adjust this parameter, you should do load testing. Please refer [Load Testing for concurrency](./loadtest.md).                                                                                                                                                                                                                                                                                            |
| Max Size        | `appRunnerMaxSize`     | The maximum number of instances that your service can scale up to. This is the highest number of instances that can concurrently handle your service's traffic.                                                                                                                                                               | If you want to be able to support high loads of traffic, you can start with a high value and adjust it down after you detect peak loads. This will allow you to do cost control on the system to not scale up to unpredicted traffic. For example: DoS attack or users abusing the system. Also see [Load Testing for concurrency](./loadtest.md) for how much traffic can be handled by how many instances. |
| Min Size        | `appRunnerMinSize`     | The minimum number of instances that App Runner can provision for your service. The service always has at least this number of provisioned instances. Some of these instances actively handle traffic. The remainder of them are part of the cost-effective compute capacity reserve, which is ready to be quickly activated. | MinSize depends if you allow your peak time users to have errors and wait until the scale-up process is completed. For a production system and unknown load is risky to put this at 1. Is better to start with a minSize: 2-3 and reduce it to one after the load and peaks are known. MinSize puts instances in warm state and you pay only for the allocated memory.                                       |

For more information, please refer the link below.
<https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html>

### App Runner Pricing Mechanism

App Runner is based on two types of pricing.

For provisioned instances which don't handle any traffic, it costs only for Memory usage.
For active instances which handle traffic, it costs for both of CPU and Memory usage.

The unit pricing depends on region. For example, in ap-northeast-1(Tokyo), 0.009 USD/GB for Memory usage and 0.081 USD/vCPU for CPU usage.
Unit pricing for Memory doesn't depend on whether the instance handles traffic or not.

For more information, please refer the link below.
<https://aws.amazon.com/apprunner/pricing/>

### How to estimate the concurrency value

To estimate this value, you should monitor your traffic and how your instances are performing in terms of memory and cpu. If you don't know your traffic and workload patterns, you can execute a simple load balancing test provided in this project. [Load testing](../loadtest.md)

#### Default concurrency value

For a 2vCPU/4GB configuration instance on AWS App Runner, you can setup the concurrency to a value of `10`. This was estimated by doing a load test to the `index.php` page with one instance.
The simulation created `60` users, achieved and average of `12` req/sec with an average latency of `1` second and a reported average concurrency of `14` in the AWS Console App Runner service. In this state the instance processing (CPU) is at max, but is still able to process request with the mentioned latency. If your usage of REDCap has heavy processing tasks/request you might need to consider to lower the concurrency.

For a more approximated test, we recommend that you simulate a request closer to your most used REDCap use case, like for example answering a form.
