import path from "node:path";
import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import type { DeploymentConfig } from "./deployment-config";

export interface ForeverProfessionsStackProps extends StackProps {
  readonly deployment: DeploymentConfig;
}

export class ForeverProfessionsStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ForeverProfessionsStackProps,
  ) {
    const { deployment, ...stackProps } = props;
    super(scope, id, stackProps);

    const dataClusterEndpoint = ssm.StringParameter.valueForStringParameter(
      this,
      deployment.dataClusterEndpointParameterName,
    );
    const dataClusterIdentifier = ssm.StringParameter.valueForStringParameter(
      this,
      deployment.dataClusterIdentifierParameterName,
    );
    const dataClusterArn = this.formatArn({
      service: "dsql",
      resource: "cluster",
      resourceName: dataClusterIdentifier,
    });

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });
    Validations.of(siteBucket).acknowledge({
      id: "AwsSolutions::AwsSolutions-S1",
      reason:
        "The site bucket is private and readable only through CloudFront origin access control. Viewer logging is handled at the distribution layer and is deferred to the low-cost observability phase.",
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
        ttl: Duration.seconds(0),
      })),
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    Validations.of(distribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR1",
      reason:
        "Forever Professions is intended for a global game audience, so geographic restrictions would block legitimate users without improving the current threat model.",
    });
    Validations.of(distribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR2",
      reason:
        "Paid WAF features are deferred by the accepted USD 10 monthly cost guardrail; Phase 9 will reassess WAF after traffic and threat evidence exists.",
    });
    Validations.of(distribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR3",
      reason:
        "CloudFront access logging is deferred to Phase 6 so its storage and retention can be introduced with the complete low-cost observability policy.",
    });
    Validations.of(distribution).acknowledge({
      id: "AwsSolutions::AwsSolutions-CFR4",
      reason:
        "The initial launch uses the generated CloudFront domain and default certificate. Phase 9 introduces ACM and an explicit modern TLS policy with the custom domain.",
    });

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention: deployment.logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new lambdaNodejs.NodejsFunction(this, "ApiFunction", {
      entry: path.join(__dirname, "../../apps/api/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      reservedConcurrentExecutions: 5,
      timeout: Duration.seconds(10),
      logGroup: apiLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node24",
      },
      environment: {
        DSQL_ENDPOINT: dataClusterEndpoint,
        DATA_DATABASE_ROLE: "forever_professions_application_reader",
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    Validations.of(apiFunction).acknowledge({
      id: "AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]",
      reason:
        "CDK attaches the standard Lambda basic execution policy for CloudWatch log delivery; application database access remains a separate resource-scoped statement.",
    });
    Validations.of(apiFunction).acknowledge({
      id: "AwsSolutions-IAM5[Resource::*]",
      reason:
        "Active X-Ray tracing requires xray:PutTraceSegments and xray:PutTelemetryRecords on Resource * because those write APIs do not support resource-level permissions.",
    });
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dsql:DbConnect"],
        resources: [dataClusterArn],
      }),
    );

    const apiIntegration = new integrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction,
    );

    const apiAccessLogGroup = new logs.LogGroup(this, "ApiAccessLogGroup", {
      retention: deployment.logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const api = new apigwv2.HttpApi(this, "HttpApi", {
      defaultIntegration: apiIntegration,
      corsPreflight: {
        allowHeaders: ["content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
        maxAge: Duration.days(1),
      },
    });
    Validations.of(api).acknowledge({
      id: "AwsSolutions::AwsSolutions-APIG4",
      reason:
        "The catalog and route-planning API is intentionally public and read-oriented; it accepts no user identity or privileged mutation. CloudFront, input validation, bounded Lambda concurrency, and future rate controls provide the intended boundary.",
    });
    const defaultStage = api.defaultStage?.node.defaultChild;
    if (!(defaultStage instanceof apigwv2.CfnStage)) {
      throw new Error("Expected the HTTP API to create a default stage.");
    }
    defaultStage.accessLogSettings = {
      destinationArn: apiAccessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        requestTime: "$context.requestTime",
        httpMethod: "$context.httpMethod",
        path: "$context.path",
        routeKey: "$context.routeKey",
        status: "$context.status",
        responseLength: "$context.responseLength",
        integrationError: "$context.integrationErrorMessage",
      }),
    };
    distribution.addBehavior(
      "api/*",
      new origins.HttpOrigin(Fn.select(2, Fn.split("/", api.apiEndpoint))),
      {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    );

    new CfnOutput(this, "WebUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new CfnOutput(this, "DistributionDomainName", {
      value: distribution.distributionDomainName,
    });
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "ApiFunctionRoleArn", {
      value: apiFunction.role!.roleArn,
    });
    new CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
  }
}
