import fs from 'fs';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ECRClient, CreateRepositoryCommand, DescribeRepositoriesCommand } from '@aws-sdk/client-ecr';
import { IAMClient, AttachRolePolicyCommand, CreateRoleCommand, GetRoleCommand, PutRolePolicyCommand, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';
import { EC2Client, AssociateRouteTableCommand, AttachInternetGatewayCommand, AuthorizeSecurityGroupEgressCommand, CreateInternetGatewayCommand, CreateRouteCommand, CreateRouteTableCommand, CreateSecurityGroupCommand, CreateSubnetCommand, CreateVpcCommand, DescribeAvailabilityZonesCommand, DescribeInternetGatewaysCommand, DescribeSecurityGroupsCommand, DescribeSubnetsCommand, DescribeVpcsCommand, ModifySubnetAttributeCommand } from '@aws-sdk/client-ec2';
import { CloudWatchLogsClient, CreateLogGroupCommand, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { CodeBuildClient, BatchGetBuildsCommand, CreateProjectCommand, StartBuildCommand, UpdateProjectCommand } from '@aws-sdk/client-codebuild';
import { ECSClient, CreateClusterCommand, DescribeClustersCommand, RegisterTaskDefinitionCommand } from '@aws-sdk/client-ecs';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['\"]|['\"]$/g, '');
  }
}

loadEnvFile('.env.local');

const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.S3_BUCKET_RENDERS || process.env.AWS_S3_BUCKET_NAME;
if (!bucket) throw new Error('AWS_S3_BUCKET_NAME or S3_BUCKET_RENDERS required');

const sts = new STSClient({ region });
const s3 = new S3Client({ region });
const ecr = new ECRClient({ region });
const iam = new IAMClient({ region });
const ec2 = new EC2Client({ region });
const logs = new CloudWatchLogsClient({ region });
const codebuild = new CodeBuildClient({ region });
const ecs = new ECSClient({ region });

const names = {
  repo: 'foldder-render-worker',
  cluster: 'foldder-video-render-cluster',
  taskFamily: 'foldder-video-render-worker',
  container: 'render-worker',
  executionRole: 'foldder-render-worker-execution-role',
  taskRole: 'foldder-render-worker-task-role',
  codebuildRole: 'foldder-render-worker-codebuild-role',
  codebuildProject: 'foldder-render-worker-build',
  taskLogGroup: '/foldder/video-render-worker',
  buildLogGroup: '/aws/codebuild/foldder-render-worker-build',
  securityGroup: 'foldder-video-render-worker-sg',
  vpcName: 'foldder-video-render-vpc',
};

async function ensureLogGroup(name) {
  const existing = await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: name }));
  if (existing.logGroups?.some((g) => g.logGroupName === name)) return;
  await logs.send(new CreateLogGroupCommand({ logGroupName: name }));
}

async function ensureRole(roleName, servicePrincipal) {
  const assumeRolePolicyDocument = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: servicePrincipal }, Action: 'sts:AssumeRole' }],
  });
  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    await iam.send(new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: assumeRolePolicyDocument }));
    return existing.Role;
  } catch (error) {
    if (!['NoSuchEntity','NoSuchEntityException'].includes(error?.name)) throw error;
  }
  const created = await iam.send(new CreateRoleCommand({ RoleName: roleName, AssumeRolePolicyDocument: assumeRolePolicyDocument }));
  return created.Role;
}

async function ensureEcrRepo() {
  try {
    const existing = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [names.repo] }));
    return existing.repositories?.[0];
  } catch (error) {
    if (error?.name !== 'RepositoryNotFoundException') throw error;
  }
  const created = await ecr.send(new CreateRepositoryCommand({ repositoryName: names.repo, imageScanningConfiguration: { scanOnPush: true } }));
  return created.repository;
}

async function getOrCreateRenderVpcAndSubnets() {
  const existingByTag = await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: 'tag:Name', Values: [names.vpcName] }] }));
  const taggedVpc = existingByTag.Vpcs?.[0];
  if (taggedVpc?.VpcId) {
    const subnets = await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [taggedVpc.VpcId] }, { Name: 'tag:Project', Values: ['foldder-video-render'] }] }));
    const subnetIds = (subnets.Subnets || []).map((s) => s.SubnetId).filter(Boolean);
    if (subnetIds.length) return { vpcId: taggedVpc.VpcId, subnetIds };
  }

  const defaults = await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: 'is-default', Values: ['true'] }] }));
  const defaultVpc = defaults.Vpcs?.[0];
  if (defaultVpc?.VpcId) {
    const subnets = await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [defaultVpc.VpcId] }] }));
    const subnetIds = (subnets.Subnets || []).map((s) => s.SubnetId).filter(Boolean);
    if (subnetIds.length) return { vpcId: defaultVpc.VpcId, subnetIds };
  }

  console.log('No default VPC found. Creating dedicated public VPC for Fargate render...');
  const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: '10.42.0.0/16', TagSpecifications: [{ ResourceType: 'vpc', Tags: [{ Key: 'Name', Value: names.vpcName }, { Key: 'Project', Value: 'foldder-video-render' }] }] }));
  const vpcId = vpc.Vpc?.VpcId;
  if (!vpcId) throw new Error('Could not create VPC');

  const igws = await ec2.send(new DescribeInternetGatewaysCommand({ Filters: [{ Name: 'tag:Project', Values: ['foldder-video-render'] }] }));
  let igwId = igws.InternetGateways?.[0]?.InternetGatewayId;
  if (!igwId) {
    const igw = await ec2.send(new CreateInternetGatewayCommand({ TagSpecifications: [{ ResourceType: 'internet-gateway', Tags: [{ Key: 'Name', Value: `${names.vpcName}-igw` }, { Key: 'Project', Value: 'foldder-video-render' }] }] }));
    igwId = igw.InternetGateway?.InternetGatewayId;
  }
  if (!igwId) throw new Error('Could not create Internet Gateway');
  try {
    await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
  } catch (error) {
    if (!['Resource.AlreadyAssociated', 'InvalidInternetGatewayID.Attached'].includes(error?.name)) throw error;
  }

  const azs = await ec2.send(new DescribeAvailabilityZonesCommand({ Filters: [{ Name: 'state', Values: ['available'] }] }));
  const zones = (azs.AvailabilityZones || []).map((z) => z.ZoneName).filter(Boolean).slice(0, 2);
  if (!zones.length) throw new Error('No availability zones available');

  const subnetIds = [];
  for (let i = 0; i < Math.min(2, zones.length); i++) {
    const subnet = await ec2.send(new CreateSubnetCommand({
      VpcId: vpcId,
      AvailabilityZone: zones[i],
      CidrBlock: `10.42.${i + 1}.0/24`,
      TagSpecifications: [{ ResourceType: 'subnet', Tags: [{ Key: 'Name', Value: `${names.vpcName}-public-${i + 1}` }, { Key: 'Project', Value: 'foldder-video-render' }] }],
    }));
    if (subnet.Subnet?.SubnetId) {
      subnetIds.push(subnet.Subnet.SubnetId);
      await ec2.send(new ModifySubnetAttributeCommand({ SubnetId: subnet.Subnet.SubnetId, MapPublicIpOnLaunch: { Value: true } }));
    }
  }
  if (!subnetIds.length) throw new Error('Could not create subnets');

  const rt = await ec2.send(new CreateRouteTableCommand({ VpcId: vpcId, TagSpecifications: [{ ResourceType: 'route-table', Tags: [{ Key: 'Name', Value: `${names.vpcName}-public-rt` }, { Key: 'Project', Value: 'foldder-video-render' }] }] }));
  const routeTableId = rt.RouteTable?.RouteTableId;
  if (!routeTableId) throw new Error('Could not create route table');
  await ec2.send(new CreateRouteCommand({ RouteTableId: routeTableId, DestinationCidrBlock: '0.0.0.0/0', GatewayId: igwId }));
  for (const subnetId of subnetIds) {
    await ec2.send(new AssociateRouteTableCommand({ RouteTableId: routeTableId, SubnetId: subnetId }));
  }
  return { vpcId, subnetIds };
}

async function ensureSecurityGroup(vpcId) {
  const existing = await ec2.send(new DescribeSecurityGroupsCommand({ Filters: [{ Name: 'group-name', Values: [names.securityGroup] }, { Name: 'vpc-id', Values: [vpcId] }] }));
  const found = existing.SecurityGroups?.[0];
  if (found?.GroupId) return found.GroupId;
  const created = await ec2.send(new CreateSecurityGroupCommand({ GroupName: names.securityGroup, Description: 'Foldder video render worker egress-only SG', VpcId: vpcId }));
  const groupId = created.GroupId;
  try {
    await ec2.send(new AuthorizeSecurityGroupEgressCommand({
      GroupId: groupId,
      IpPermissions: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
    }));
  } catch (error) {
    if (error?.name !== 'InvalidPermission.Duplicate') throw error;
  }
  return groupId;
}

function makeZip() {
  const tempDir = join(tmpdir(), `foldder-render-worker-src-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const sourceRoot = resolve('render-worker');
  const targetRoot = join(tempDir, 'render-worker');
  fs.cpSync(sourceRoot, targetRoot, { recursive: true });
  const zipPath = join(tmpdir(), `foldder-render-worker-${Date.now()}.zip`);
  execFileSync('zip', ['-qr', zipPath, 'render-worker'], { cwd: tempDir, stdio: 'inherit' });
  fs.rmSync(tempDir, { recursive: true, force: true });
  return zipPath;
}

async function uploadBuildSource(zipPath) {
  const key = `knowledge-files/render-worker/source-${Date.now()}.zip`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.readFileSync(zipPath), ContentType: 'application/zip' }));
  return key;
}

async function ensureCodeBuildProject(roleArn, repoUri, sourceKey) {
  const buildspec = [
    'version: 0.2',
    'phases:',
    '  pre_build:',
    '    commands:',
    `      - aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${repoUri.split('/')[0]}`,
    '  build:',
    '    commands:',
    `      - docker build -t ${names.repo}:latest ./render-worker`,
    `      - docker tag ${names.repo}:latest ${repoUri}:latest`,
    '  post_build:',
    '    commands:',
    `      - docker push ${repoUri}:latest`,
  ].join('\n');
  const config = {
    name: names.codebuildProject,
    source: { type: 'S3', location: `${bucket}/${sourceKey}`, buildspec },
    artifacts: { type: 'NO_ARTIFACTS' },
    environment: { type: 'LINUX_CONTAINER', image: 'aws/codebuild/standard:7.0', computeType: 'BUILD_GENERAL1_MEDIUM', privilegedMode: true },
    serviceRole: roleArn,
    logsConfig: { cloudWatchLogs: { status: 'ENABLED', groupName: names.buildLogGroup, streamName: 'build' } },
  };
  try {
    await codebuild.send(new CreateProjectCommand(config));
  } catch (error) {
    if (error?.name !== 'ResourceAlreadyExistsException') throw error;
    await codebuild.send(new UpdateProjectCommand(config));
  }
}

async function startAndWaitBuild() {
  const started = await codebuild.send(new StartBuildCommand({ projectName: names.codebuildProject }));
  const id = started.build?.id;
  if (!id) throw new Error('CodeBuild did not return build id');
  console.log(`CodeBuild started: ${id}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 10000));
    const result = await codebuild.send(new BatchGetBuildsCommand({ ids: [id] }));
    const build = result.builds?.[0];
    const status = build?.buildStatus;
    console.log(`CodeBuild status: ${status}`);
    if (status === 'SUCCEEDED') return;
    if (status === 'FAILED' || status === 'FAULT' || status === 'STOPPED' || status === 'TIMED_OUT') {
      throw new Error(`CodeBuild failed: ${status}. Check CloudWatch logs ${names.buildLogGroup}`);
    }
  }
}

function envUpdateText(path, updates) {
  const current = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  const lines = current.split(/\n/);
  const seen = new Set();
  const next = lines.map((line) => {
    const m = line.match(/^([^#=][^=]*)=/);
    if (!m) return line;
    const key = m[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  fs.writeFileSync(path, next.join('\n').replace(/\n{3,}/g, '\n\n'));
}

async function main() {
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  console.log(`AWS account: ${accountId}`);

  await ensureLogGroup(names.taskLogGroup);
  await ensureLogGroup(names.buildLogGroup);

  const repo = await ensureEcrRepo();
  const repoUri = repo.repositoryUri;
  console.log(`ECR repo: ${repoUri}`);

  const executionRole = await ensureRole(names.executionRole, 'ecs-tasks.amazonaws.com');
  await iam.send(new AttachRolePolicyCommand({ RoleName: names.executionRole, PolicyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy' })).catch((e) => {
    if (e?.name !== 'EntityAlreadyExists') throw e;
  });

  const taskRole = await ensureRole(names.taskRole, 'ecs-tasks.amazonaws.com');
  await iam.send(new PutRolePolicyCommand({
    RoleName: names.taskRole,
    PolicyName: 'foldder-render-worker-s3-access',
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: `arn:aws:s3:::${bucket}/knowledge-files/*` },
        { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}` },
      ],
    }),
  }));

  const codebuildRole = await ensureRole(names.codebuildRole, 'codebuild.amazonaws.com');
  await iam.send(new PutRolePolicyCommand({
    RoleName: names.codebuildRole,
    PolicyName: 'foldder-render-worker-codebuild-access',
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: '*' },
        { Effect: 'Allow', Action: ['s3:GetObject', 's3:GetObjectVersion'], Resource: `arn:aws:s3:::${bucket}/knowledge-files/render-worker/*` },
        { Effect: 'Allow', Action: ['ecr:GetAuthorizationToken'], Resource: '*' },
        { Effect: 'Allow', Action: ['ecr:BatchCheckLayerAvailability', 'ecr:CompleteLayerUpload', 'ecr:InitiateLayerUpload', 'ecr:PutImage', 'ecr:UploadLayerPart'], Resource: `arn:aws:ecr:${region}:${accountId}:repository/${names.repo}` },
      ],
    }),
  }));

  console.log('Waiting for IAM role propagation...');
  await new Promise((resolve) => setTimeout(resolve, 15000));

  const zipPath = makeZip();
  const sourceKey = await uploadBuildSource(zipPath);
  fs.rmSync(zipPath, { force: true });
  await ensureCodeBuildProject(codebuildRole.Arn, repoUri, sourceKey);
  await startAndWaitBuild();

  const { vpcId, subnetIds } = await getOrCreateRenderVpcAndSubnets();
  const sgId = await ensureSecurityGroup(vpcId);
  console.log(`VPC: ${vpcId}`);
  console.log(`Subnets: ${subnetIds.join(',')}`);
  console.log(`Security group: ${sgId}`);

  const described = await ecs.send(new DescribeClustersCommand({ clusters: [names.cluster] }));
  if (!described.clusters?.some((cluster) => cluster.clusterName === names.cluster && cluster.status !== 'INACTIVE')) {
    await ecs.send(new CreateClusterCommand({ clusterName: names.cluster }));
  }

  const task = await ecs.send(new RegisterTaskDefinitionCommand({
    family: names.taskFamily,
    networkMode: 'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    cpu: '2048',
    memory: '4096',
    executionRoleArn: executionRole.Arn,
    taskRoleArn: taskRole.Arn,
    containerDefinitions: [{
      name: names.container,
      image: `${repoUri}:latest`,
      essential: true,
      logConfiguration: { logDriver: 'awslogs', options: { 'awslogs-group': names.taskLogGroup, 'awslogs-region': region, 'awslogs-stream-prefix': 'render' } },
    }],
  }));
  const taskDefinitionArn = task.taskDefinition?.taskDefinitionArn;
  if (!taskDefinitionArn) throw new Error('No task definition ARN returned');

  const updates = {
    AWS_ACCOUNT_ID: accountId,
    AWS_ECS_CLUSTER: names.cluster,
    AWS_ECS_TASK_DEFINITION: taskDefinitionArn,
    AWS_ECS_SUBNETS: subnetIds.join(','),
    AWS_ECS_SECURITY_GROUPS: sgId,
    AWS_ECS_CONTAINER_NAME: names.container,
    AWS_ECS_ASSIGN_PUBLIC_IP: 'ENABLED',
    S3_BUCKET_RENDERS: bucket,
  };
  envUpdateText('.env.local', updates);
  if (fs.existsSync('.vercel/.env.production.local')) envUpdateText('.vercel/.env.production.local', updates);

  console.log('Fargate video render provisioned. Env files updated.');
  console.log(JSON.stringify(updates, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
