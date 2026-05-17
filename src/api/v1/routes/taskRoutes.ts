import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TaskController } from '../controllers/TaskController';
import { validateBody } from '../../middleware/validateBody';
import { idempotencyGuard } from '../../middleware/idempotencyGuard';
import { CreateTaskRequestDTO } from '../../dtos/TransportDTOs';

const router = Router();
const controller = new TaskController();

const taskRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }
});

router.post(
  '/',
  taskRateLimit,
  idempotencyGuard,
  validateBody(CreateTaskRequestDTO),
  (req, res) => controller.createTask(req, res)
);

export default router;
