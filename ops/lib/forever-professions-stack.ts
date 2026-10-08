import path from "node:path";
import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
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
import {
  DATA_CLUSTER_ENDPOINT_PARAMETER_NAME,
  DATA_CLUSTER_IDENTIFIER_PARAMETER_NAME,
} from "./forever-professions-data-stack";

export class ForeverProfessionsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const dataClusterEndpoint = ssm.StringParameter.valueForStringParameter(
      this,
      DATA_CLUSTER_ENDPOINT_PARAMETER_NAME,
    );
    const dataClusterIdentifier = ssm.StringParameter.valueForStringParameter(
      this,
      DATA_CLUSTER_IDENTIFIER_PARAMETER_NAME,
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

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention: logs.RetentionDays.ONE_MONTH,
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
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "ApiFunctionRoleArn", {
      value: apiFunction.role!.roleArn,
    });
    new CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
  }
}
