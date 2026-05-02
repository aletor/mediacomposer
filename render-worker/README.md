# Foldder Video Render Worker

Worker Docker para renderizar timelines del Video Editor con FFmpeg en AWS Fargate.

## Flujo

1. Next API sube `manifest.json` y `status.json` a S3.
2. Next API lanza una task Fargate.
3. El worker descarga el manifest y los assets.
4. FFmpeg genera `output.mp4`.
5. El worker sube `output.mp4` y actualiza `status.json`.

## Variables de entorno de la task

La API las inyecta mediante `RunTask`:

- `RENDER_ID`
- `RENDER_MANIFEST_S3_KEY`
- `RENDER_STATUS_S3_KEY`
- `RENDER_OUTPUT_S3_KEY`
- `S3_BUCKET`
- `AWS_REGION`

## Variables necesarias en la app

- `AWS_REGION`
- `AWS_ECS_CLUSTER`
- `AWS_ECS_TASK_DEFINITION`
- `AWS_ECS_SUBNETS`
- `AWS_ECS_SECURITY_GROUPS`
- `AWS_ECS_CONTAINER_NAME` opcional, default `render-worker`
- `AWS_ECS_ASSIGN_PUBLIC_IP` opcional, default `ENABLED`
- `S3_BUCKET_RENDERS` opcional, default `AWS_S3_BUCKET_NAME`

## Build local

```bash
docker build -t foldder-render-worker ./render-worker
```

## Nota

La task role de ECS debe poder leer/escribir en el bucket usado por `S3_BUCKET`.
