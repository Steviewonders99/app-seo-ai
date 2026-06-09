import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Import routes
import keywordRoutes from './routes/keywordRoutes.js';
import serpRoutes from './routes/serpRoutes.js';
import competitorRoutes from './routes/competitorRoutes.js';
import { bearerAuth } from './middleware/auth.js';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Bearer-token gate — no-op unless SEO_AI_API_KEY is set (prod / ACA).
app.use(bearerAuth);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'App SEO AI API',
      version: '1.0.0',
      description: 'API for SEO automation and AI-powered optimization',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
app.use('/api/keywords', keywordRoutes);
app.use('/api/serp', serpRoutes);
app.use('/api/competitors', competitorRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Bind to 0.0.0.0 in containers so ACA's ingress can reach the process.
const HOST = process.env.HOST ?? '0.0.0.0';

// Start server
app.listen(PORT, HOST, () => {
  const authMode = process.env.SEO_AI_API_KEY ? 'bearer-auth' : 'open (dev)';
  console.log(`Server running on ${HOST}:${PORT}  [${authMode}]`);
  console.log(`API docs:  http://${HOST}:${PORT}/api-docs`);
  console.log(`Health:    http://${HOST}:${PORT}/health`);
});

export default app;