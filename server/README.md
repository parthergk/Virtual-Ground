# Virtual Ramlila Ground — Realtime WebSocket Server

A lightweight Socket.io relay server to synchronize players on Virtual Ramlila Ground in real time.

---

## 1. Local Development

```bash
cd server
npm install
npm run dev
```

The server runs on `http://localhost:3001`.
Verify the health check in your browser: `http://localhost:3001/health`.

---

## 2. Deploying to AWS EC2

### Step A: Launch EC2 Instance
1. Instance type: **t4g.nano**, **t4g.micro**, or **t3.micro** (Ubuntu 22.04 or 24.04 LTS).
2. **Security Group**:
   - Inbound rules:
     - `SSH (22)`: Your IP
     - `HTTP (80)`: `0.0.0.0/0`
     - `HTTPS (443)`: `0.0.0.0/0`
     - *(Optional for testing)* `Custom TCP (3001)`: `0.0.0.0/0`
3. Allocate and associate an **Elastic IP** to your EC2 instance so the IP does not change on reboot.

---

### Step B: Connect and Install Node.js & PM2

SSH into your EC2 instance:
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

Install Node.js 20 LTS:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# Install PM2 globally
sudo npm install -g pm2
```

---

### Step C: Clone & Run with PM2

```bash
# Clone the repository
git clone https://github.com/parthergk/Virtual-Ground.git
cd Virtual-Ground/server

# Install dependencies
npm install --production

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

### Step D: Configure Nginx with SSL (Required for HTTPS on Vercel)

Because the Vercel frontend is `https://`, browsers will block non-SSL `ws://`. You must point a subdomain (e.g. `socket.yourdomain.com`) to your EC2 Elastic IP and set up SSL via Let's Encrypt.

1. Create Nginx config:
```bash
sudo nano /etc/nginx/sites-available/socket
```

2. Paste configuration:
```nginx
server {
    server_name socket.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Enable and test Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/socket /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. Install free SSL certificate with Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d socket.yourdomain.com
```

---

### Step E: Update Next.js Frontend on Vercel

In your Vercel Project Settings > **Environment Variables**:
- Name: `NEXT_PUBLIC_SOCKET_URL`
- Value: `https://socket.yourdomain.com`

Redeploy the Vercel app. Both devices will now connect over secure WebSockets (`wss://`).
