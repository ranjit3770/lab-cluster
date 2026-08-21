# Build stage
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Nginx config to handle SPA routing
RUN echo 'server { \
    listen 80; \
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always; \
    add_header Pragma "no-cache" always; \
    add_header Expires "0" always; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /assets/ { \
        root /usr/share/nginx/html; \
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always; \
        try_files $uri =404; \
    } \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
