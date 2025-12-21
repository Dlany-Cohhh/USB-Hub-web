FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# 复制所有项目文件到 nginx 默认目录（确保 nginx.conf 与 resource 在镜像内）
COPY . .

# 覆盖默认 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]



