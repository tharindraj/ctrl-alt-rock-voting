const express = require('express');
const dataManager = require('../utils/dataManager');
const { authenticateToken, requireJudge } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all judge routes
router.use(authenticateToken);
router.use(requireJudge);

// Get all categories for judging
router.get('/categories', async (req, res) => {
  try {
    const categories = await dataManager.readData('categories');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

// Get contestants for a specific category
router.get('/categories/:categoryId/contestants', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const contestants = await dataManager.readData('contestants');
    
    const categoryContestants = contestants.list.filter(c => c.categoryId === categoryId);
    res.json({ contestants: categoryContestants });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching contestants' });
  }
});

// Get judging criteria for a category
router.get('/categories/:categoryId/criteria', async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log(`Judge requesting criteria for category: ${categoryId}`);
    
    // First try to get criteria from settings (new category-specific system)
    try {
      const settings = await dataManager.readData('settings');
      console.log('Settings loaded, checking categoryScoringCriteria...');
      console.log('Available categories in settings:', Object.keys(settings.categoryScoringCriteria || {}));
      
      if (settings.categoryScoringCriteria && settings.categoryScoringCriteria[categoryId]) {
        console.log(`Found criteria for category ${categoryId}:`, settings.categoryScoringCriteria[categoryId]);
        const categoryCriteria = settings.categoryScoringCriteria[categoryId].map((criteria, index) => ({
          id: `${categoryId}_${index}`,
          name: criteria.name,
          description: criteria.description || '',
          weight: criteria.weight,
          maxScore: criteria.maxScore
        }));
        console.log('Returning criteria:', categoryCriteria);
        return res.json({ categoryId, criteria: categoryCriteria });
      } else {
        console.log(`No criteria found for category ${categoryId} in settings`);
      }
    } catch (settingsError) {
      console.log('Error reading settings:', settingsError);
    }
    
    // Fallback to legacy judgingCriteria.json format
    try {
      const judgingCriteria = await dataManager.readData('judgingCriteria');
      const categoryCriteria = judgingCriteria.categories?.[categoryId] || [];
      res.json({ categoryId, criteria: categoryCriteria });
    } catch (legacyError) {
      res.json({ categoryId, criteria: [] });
    }
  } catch (error) {
    console.error('Error fetching judging criteria:', error);
    res.status(500).json({ message: 'Error fetching judging criteria' });
  }
});

// Get judge's scores for a category (to check if finalized)
router.get('/categories/:categoryId/my-scores', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const judgeId = req.user.id;
    
    const [scores, contestants] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants')
    ]);

    const categoryContestants = contestants.list.filter(c => c.categoryId === categoryId);
    const judgeScores = {};
    let isFinalized = false;

    categoryContestants.forEach(contestant => {
      const contestantScores = scores.judgeScores[contestant.id];
      if (contestantScores && contestantScores[judgeId]) {
        judgeScores[contestant.id] = contestantScores[judgeId];
        if (contestantScores[judgeId].finalized) {
          isFinalized = true;
        }
      }
    });

    res.json({ 
      categoryId, 
      scores: judgeScores, 
      isFinalized,
      contestants: categoryContestants 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching judge scores' });
  }
});

// Submit or update scores for a contestant
router.post('/contestants/:contestantId/score', async (req, res) => {
  try {
    const { contestantId } = req.params;
    const judgeId = req.user.id;
    const { criteriaScores, comments } = req.body;

    // Get current scores data
    const scores = await dataManager.readData('scores');
    
    if (!scores.judgeScores[contestantId]) {
      scores.judgeScores[contestantId] = {};
    }

    // Calculate total score based on criteria weights
    const judgingCriteria = await dataManager.readData('judgingCriteria');
    const contestant = await dataManager.readData('contestants');
    const contestantData = contestant.list.find(c => c.id === contestantId);
    
    if (!contestantData) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    const categoryCriteria = judgingCriteria.categories[contestantData.categoryId] || [];
    let totalScore = 0;
    let maxPossibleScore = 0;

    // Calculate weighted score
    categoryCriteria.forEach(criteria => {
      const criteriaScore = criteriaScores[criteria.id] || 0;
      const weight = criteria.weight / 100; // Convert percentage to decimal
      totalScore += criteriaScore * weight;
      maxPossibleScore += criteria.maxScore * weight;
    });

    // Store the judge's score
    scores.judgeScores[contestantId][judgeId] = {
      criteriaScores,
      comments: comments || {},
      totalScore,
      maxPossibleScore,
      submittedAt: new Date().toISOString(),
      finalized: false
    };

    await dataManager.writeData('scores', scores);

    res.json({ 
      message: 'Score submitted successfully', 
      totalScore,
      maxPossibleScore
    });
  } catch (error) {
    console.error('Score submission error:', error);
    res.status(500).json({ message: 'Error submitting score' });
  }
});

// Get contestant details and judge's current scores
router.get('/contestants/:contestantId', async (req, res) => {
  try {
    const { contestantId } = req.params;
    const judgeId = req.user.id;

    const [contestants, scores, judgingCriteria] = await Promise.all([
      dataManager.readData('contestants'),
      dataManager.readData('scores'),
      dataManager.readData('judgingCriteria')
    ]);

    const contestant = contestants.list.find(c => c.id === contestantId);
    if (!contestant) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    const categoryCriteria = judgingCriteria.categories[contestant.categoryId] || [];
    
    let currentScores = {};
    if (scores.judgeScores[contestantId] && scores.judgeScores[contestantId][judgeId]) {
      currentScores = scores.judgeScores[contestantId][judgeId];
    }

    res.json({
      contestant,
      criteria: categoryCriteria,
      currentScores
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching contestant details' });
  }
});

// Finalize scores for a category
router.post('/categories/:categoryId/finalize', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const judgeId = req.user.id;

    const [scores, contestants] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants')
    ]);

    const categoryContestants = contestants.list.filter(c => c.categoryId === categoryId);
    
    // Check if all contestants in the category have been scored
    const unscored = [];
    categoryContestants.forEach(contestant => {
      if (!scores.judgeScores[contestant.id] || !scores.judgeScores[contestant.id][judgeId]) {
        unscored.push(contestant.name);
      }
    });

    if (unscored.length > 0) {
      return res.status(400).json({ 
        message: `Please score all contestants first. Missing scores for: ${unscored.join(', ')}` 
      });
    }

    // Mark all scores as finalized for this judge
    categoryContestants.forEach(contestant => {
      if (scores.judgeScores[contestant.id] && scores.judgeScores[contestant.id][judgeId]) {
        scores.judgeScores[contestant.id][judgeId].finalized = true;
        scores.judgeScores[contestant.id][judgeId].finalizedAt = new Date().toISOString();
      }
    });

    await dataManager.writeData('scores', scores);

    res.json({ message: 'Scores finalized successfully for this category' });
  } catch (error) {
    res.status(500).json({ message: 'Error finalizing scores' });
  }
});

// Get top contestants in a category (only if all judges have finalized)
router.get('/categories/:categoryId/results', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const [scores, contestants, judges] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants'),
      dataManager.readData('judges')
    ]);

    const categoryContestants = contestants.list.filter(c => c.categoryId === categoryId);
    const allJudges = judges.list;

    // Check if all judges have finalized their scores for this category
    const results = [];
    
    for (const contestant of categoryContestants) {
      const contestantScores = scores.judgeScores[contestant.id] || {};
      let totalScore = 0;
      let finalizedJudges = 0;

      allJudges.forEach(judge => {
        const judgeScore = contestantScores[judge.id];
        if (judgeScore && judgeScore.finalized) {
          totalScore += judgeScore.totalScore || 0;
          finalizedJudges++;
        }
      });

      // Only include if all judges have scored and finalized
      if (finalizedJudges === allJudges.length) {
        const averageScore = totalScore / finalizedJudges;
        results.push({
          contestant,
          averageScore,
          judgeCount: finalizedJudges
        });
      }
    }

    // Sort by average score (highest first)
    results.sort((a, b) => b.averageScore - a.averageScore);

    // Only show results if all contestants have been judged by all judges
    const allJudged = results.length === categoryContestants.length;

    res.json({ 
      categoryId,
      results: allJudged ? results.slice(0, 3) : [], // Top 3
      allJudged,
      totalContestants: categoryContestants.length,
      totalJudges: allJudges.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching category results' });
  }
});

// Get other judges' scores and comments for a contestant (only if finalized)
router.get('/contestants/:contestantId/other-scores', async (req, res) => {
  try {
    const { contestantId } = req.params;
    const currentJudgeId = req.user.id;

    const [scores, judges] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('judges')
    ]);

    const contestantScores = scores.judgeScores[contestantId] || {};
    const otherScores = [];

    judges.list.forEach(judge => {
      if (judge.id !== currentJudgeId && contestantScores[judge.id] && contestantScores[judge.id].finalized) {
        otherScores.push({
          judgeId: judge.id,
          judgeName: judge.name,
          totalScore: contestantScores[judge.id].totalScore,
          criteriaScores: contestantScores[judge.id].criteriaScores,
          comments: contestantScores[judge.id].comments,
          finalizedAt: contestantScores[judge.id].finalizedAt
        });
      }
    });

    res.json({ contestantId, otherScores });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching other judges scores' });
  }
});

// Get all scores submitted by this judge (for My Scores display)
router.get('/my-scores', async (req, res) => {
  try {
    const judgeId = req.user.id;
    
    const [scores, contestants, categories] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants'),
      dataManager.readData('categories')
    ]);

    const myScores = [];
    
    // Loop through all contestants to find this judge's scores
    Object.keys(scores.judgeScores || {}).forEach(contestantId => {
      const contestantScores = scores.judgeScores[contestantId];
      if (contestantScores && contestantScores[judgeId]) {
        const contestant = contestants.list.find(c => c.id === contestantId);
        const category = categories.list.find(c => c.id === contestant?.categoryId);
        
        if (contestant) {
          myScores.push({
            contestantId,
            contestantName: contestant.name,
            contestantCompany: contestant.company,
            categoryId: contestant.categoryId,
            categoryName: category?.name || 'Unknown',
            totalScore: contestantScores[judgeId].totalScore,
            maxPossibleScore: contestantScores[judgeId].maxPossibleScore,
            submittedAt: contestantScores[judgeId].submittedAt,
            finalized: contestantScores[judgeId].finalized,
            criteriaScores: contestantScores[judgeId].criteriaScores || {},
            comments: contestantScores[judgeId].comments || ''
          });
        }
      }
    });

    // Sort by submission date (newest first)
    myScores.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    res.json({ scores: myScores });
  } catch (error) {
    console.error('Error fetching my scores:', error);
    res.status(500).json({ message: 'Error fetching your scores' });
  }
});

// Submit score for a contestant (new simplified endpoint)
router.post('/submit-score', async (req, res) => {
  try {
    const judgeId = req.user.id;
    const { contestantId, categoryId, scores: criteriaScores, comments, totalScore } = req.body;

    // Validate required fields
    if (!contestantId || !categoryId || !criteriaScores) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Get current scores data
    const scoresData = await dataManager.readData('scores');
    
    if (!scoresData.judgeScores) {
      scoresData.judgeScores = {};
    }
    
    if (!scoresData.judgeScores[contestantId]) {
      scoresData.judgeScores[contestantId] = {};
    }

    // Store the judge's score
    scoresData.judgeScores[contestantId][judgeId] = {
      criteriaScores,
      comments: comments || '',
      totalScore: totalScore || 0,
      categoryId,
      submittedAt: new Date().toISOString(),
      finalized: false
    };

    await dataManager.writeData('scores', scoresData);

    res.json({ 
      message: 'Score submitted successfully', 
      totalScore: totalScore || 0
    });
  } catch (error) {
    console.error('Score submission error:', error);
    res.status(500).json({ message: 'Error submitting score' });
  }
});

// Get completion status for all judges
router.get('/completion-status', async (req, res) => {
  console.log('Completion status endpoint called by:', req.user?.email);
  try {
    const [judgesData, scoresData, categoriesData, contestantsData] = await Promise.all([
      dataManager.readData('judges'),
      dataManager.readData('scores'),
      dataManager.readData('categories'),
      dataManager.readData('contestants')
    ]);

    const judges = judgesData.list || [];
    const judgeScores = scoresData.judgeScores || {};
    const categories = categoriesData.list || [];
    const contestants = contestantsData.list || [];

    console.log('Total judges:', judges.length);
    console.log('Judge scores structure:', Object.keys(judgeScores));
    
    const judgesCompletion = judges.map(judge => {
      const categoryProgress = categories.map(category => {
        const categoryContestants = contestants.filter(c => c.categoryId === category.id);
        
        // Count scores for this judge in this category
        let categoryScoresCount = 0;
        categoryContestants.forEach(contestant => {
          const contestantScores = judgeScores[contestant.id];
          if (contestantScores && contestantScores[judge.id]) {
            categoryScoresCount++;
          }
        });
        
        return {
          categoryId: category.id,
          categoryName: category.name,
          totalContestants: categoryContestants.length,
          completedContestants: categoryScoresCount,
          percentage: categoryContestants.length > 0 ? 
            Math.round((categoryScoresCount / categoryContestants.length) * 100) : 0
        };
      });

      // Calculate total scores across all categories
      const totalContestants = contestants.length;
      const completedScores = categoryProgress.reduce((sum, cat) => sum + cat.completedContestants, 0);
      const overallPercentage = totalContestants > 0 ? 
        Math.round((completedScores / totalContestants) * 100) : 0;
      
      console.log(`Judge ${judge.name} (${judge.username}) has ${completedScores}/${totalContestants} scores (${overallPercentage}%)`);
      categoryProgress.forEach(cat => {
        console.log(`  - ${cat.categoryName}: ${cat.completedContestants}/${cat.totalContestants} (${cat.percentage}%)`);
      });

      return {
        id: judge.id,
        name: judge.name,
        email: judge.email || judge.username, // Use username as fallback
        username: judge.username,
        categoryProgress,
        totalContestants,
        completedScores,
        overallPercentage
      };
    });

    res.json({ judges: judgesCompletion });
  } catch (error) {
    console.error('Error fetching completion status:', error);
    res.status(500).json({ message: 'Error fetching completion status' });
  }
});

module.exports = router;