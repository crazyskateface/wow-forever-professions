import path from "node:path";
import {
  CfnCondition,
  CfnOutput,
  CfnParameter,
  CfnResource,
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
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export class ForeverProfessionsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });

    const rawDataBucket = new s3.Bucket(this, "RawDataBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });

    const provisionDataCluster = new CfnParameter(this, "ProvisionDataCluster", {
      type: "String",
      allowedValues: ["true", "false"],
      default: "false",
      description: "Provision the Phase 2 Aurora DSQL cluster.",
    });
    const dataClusterEnabled = new CfnCondition(this, "DataClusterEnabled", {
      expression: Fn.conditionEquals(provisionDataCluster.valueAsString, "true"),
    });
    const dataCluster = new CfnResource(this, "DataCluster", {
      type: "AWS::DSQL::Cluster",
      properties: {
        DeletionProtectionEnabled: true,
        Tags: [
          { Key: "Project", Value: "forever-professions" },
          { Key: "Purpose", Value: "versioned-profession-data" },
        ],
      },
    });
    dataCluster.cfnOptions.condition = dataClusterEnabled;
    dataCluster.applyRemovalPolicy(RemovalPolicy.RETAIN);

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
      timeout: Duration.seconds(10),
      logGroup: apiLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node24",
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    const apiIntegration = new integrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction,
    );

    const api = new apigwv2.HttpApi(this, "HttpApi", {
      defaultIntegration: apiIntegration,
      corsPreflight: {
        allowHeaders: ["content-type"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: ["*"],
        maxAge: Duration.days(1),
      },
    });

    new CfnOutput(this, "WebUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new CfnOutput(this, "RawDataBucketName", { value: rawDataBucket.bucketName });

    const dataClusterIdentifier = new CfnOutput(this, "DataClusterIdentifier", {
      value: dataCluster.ref,
    });
    dataClusterIdentifier.condition = dataClusterEnabled;

    const dataClusterEndpoint = new CfnOutput(this, "DataClusterEndpoint", {
      value: dataCluster.getAtt("Endpoint").toString(),
    });
    dataClusterEndpoint.condition = dataClusterEnabled;
  }
}
