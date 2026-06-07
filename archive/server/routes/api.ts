import { Router } from 'express';
import { triageRulesEngine } from '../safety/triageRules';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.post('/triage/submit', (req, res) => {
  const { vitals } = req.body;
  if (!vitals) return res.status(400).json({ error: 'Missing vitals' });
  
  const isEmergency = triageRulesEngine.checkEmergency(vitals);
  
  res.json({ 
    decision: isEmergency ? 'EMERGENCY' : 'PENDING_ASSESSMENT',
    safetyOverride: isEmergency 
  });
});

export default router;
