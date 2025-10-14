const express = require('express');
const dataManager = require('../utils/dataManager');
const { authenticateToken, requireAudience, manageAudienceSession } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all audience routes
router.use(authenticateToken);
router.use(requireAudience);
router.use(manageAudienceSession);

// Get voting status
router.get('/voting-status', async (req, res) => {
  try {
    const settings = await dataManager.readData('settings');
    res.json({ 
      votingOpen: settings.votingOpen,
      message: settings.votingOpen ? 'Voting is currently open!' : 'Voting is currently closed.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching voting status' });
  }
});

// Get all categories
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

// Get contestant details
router.get('/contestants/:contestantId', async (req, res) => {
  try {
    const { contestantId } = req.params;
    const contestants = await dataManager.readData('contestants');
    
    const contestant = contestants.list.find(c => c.id === contestantId);
    if (!contestant) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    res.json({ contestant });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching contestant details' });
  }
});

// Vote for a contestant
router.post('/contestants/:contestantId/vote', async (req, res) => {
  try {
    const { contestantId } = req.params;
    const audienceId = req.user.id;

    // Check if voting is open
    const settings = await dataManager.readData('settings');
    if (!settings.votingOpen) {
      return res.status(403).json({ message: 'Voting is currently closed' });
    }

    // Check if contestant exists
    const contestants = await dataManager.readData('contestants');
    const contestant = contestants.list.find(c => c.id === contestantId);
    if (!contestant) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    // Get current votes
    const scores = await dataManager.readData('scores');
    
    // Initialize audience votes if not exists
    if (!scores.audienceVotes) {
      scores.audienceVotes = {};
    }
    if (!scores.audienceVotes[contestantId]) {
      scores.audienceVotes[contestantId] = 0;
    }

    // Initialize user votes tracking if not exists
    if (!scores.userVotes) {
      scores.userVotes = {};
    }
    if (!scores.userVotes[audienceId]) {
      scores.userVotes[audienceId] = [];
    }

    // Check if user already voted for this contestant
    if (scores.userVotes[audienceId].includes(contestantId)) {
      return res.status(400).json({ message: 'You have already voted for this contestant' });
    }

    // Add vote
    scores.audienceVotes[contestantId]++;
    scores.userVotes[audienceId].push(contestantId);

    // Log the vote
    if (!scores.voteLogs) {
      scores.voteLogs = [];
    }
    scores.voteLogs.push({
      audienceId,
      contestantId,
      votedAt: new Date().toISOString()
    });

    await dataManager.writeData('scores', scores);

    res.json({ 
      message: 'Vote submitted successfully!',
      contestant: contestant.name,
      totalVotes: scores.audienceVotes[contestantId]
    });
  } catch (error) {
    console.error('Voting error:', error);
    res.status(500).json({ message: 'Error submitting vote' });
  }
});

// Get user's voting history
router.get('/my-votes', async (req, res) => {
  try {
    const audienceId = req.user.id;
    const [scores, contestants] = await Promise.all([
      dataManager.readData('scores'),
      dataManager.readData('contestants')
    ]);

    const userVotes = scores.userVotes ? scores.userVotes[audienceId] || [] : [];
    
    // Get contestant details for voted contestants
    const votedContestants = userVotes.map(contestantId => {
      const contestant = contestants.list.find(c => c.id === contestantId);
      return contestant ? {
        id: contestant.id,
        name: contestant.name,
        company: contestant.company,
        categoryId: contestant.categoryId,
        image: contestant.image
      } : null;
    }).filter(Boolean);

    res.json({ 
      votedContestants,
      totalVotes: votedContestants.length 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching voting history' });
  }
});

// Check if user can vote for a specific contestant
router.get('/contestants/:contestantId/can-vote', async (req, res) => {
  try {
    const { contestantId } = req.params;
    const audienceId = req.user.id;

    // Check if voting is open
    const settings = await dataManager.readData('settings');
    if (!settings.votingOpen) {
      return res.json({ canVote: false, reason: 'Voting is currently closed' });
    }

    // Check if already voted
    const scores = await dataManager.readData('scores');
    const userVotes = scores.userVotes ? scores.userVotes[audienceId] || [] : [];
    
    if (userVotes.includes(contestantId)) {
      return res.json({ canVote: false, reason: 'Already voted for this contestant' });
    }

    res.json({ canVote: true });
  } catch (error) {
    res.status(500).json({ message: 'Error checking vote eligibility' });
  }
});

// Get published results (if available)
router.get('/results', async (req, res) => {
  try {
    const settings = await dataManager.readData('settings');
    
    if (!settings.results.published) {
      return res.json({ 
        published: false, 
        message: 'Results have not been published yet' 
      });
    }

    const [contestants, categories, scores] = await Promise.all([
      dataManager.readData('contestants'),
      dataManager.readData('categories'),
      dataManager.readData('scores')
    ]);

    const results = {};
    
    // Get results for each category that has been published
    Object.keys(settings.results.winners).forEach(categoryId => {
      const category = categories.list.find(c => c.id === categoryId);
      const winners = settings.results.winners[categoryId];
      
      if (category) {
        const getContestantById = (id) => contestants.list.find(c => c.id === id);
        
        // If winners are explicitly declared, use them
        if (winners && (winners.first || winners.second || winners.third)) {
          results[categoryId] = {
            category,
            winners: {
              first: winners.first ? getContestantById(winners.first) : null,
              second: winners.second ? getContestantById(winners.second) : null,
              third: winners.third ? getContestantById(winners.third) : null
            },
            publishedAt: winners.publishedAt,
            type: 'declared' // Explicitly declared winners
          };
        } else {
          // Calculate rankings from scores if no winners are declared
          const categoryContestants = contestants.list.filter(c => c.categoryId === categoryId);
          const categoryResults = [];

          for (const contestant of categoryContestants) {
            // Calculate judge scores
            const judgeScores = scores.judgeScores[contestant.id] || {};
            let totalJudgeScore = 0;
            let judgeCount = 0;

            Object.values(judgeScores).forEach(judgeScore => {
              if (judgeScore.totalScore !== undefined) {
                totalJudgeScore += judgeScore.totalScore || 0;
                judgeCount++;
              }
            });

            const avgJudgeScore = judgeCount > 0 ? totalJudgeScore / judgeCount : 0;

            // Calculate audience votes
            const rawAudienceVotes = scores.audienceVotes[contestant.id] || 0;
            const totalActiveVoters = scores.userVotes ? Object.keys(scores.userVotes).length : 0;
            const audienceParticipationRatio = totalActiveVoters > 0 ? rawAudienceVotes / totalActiveVoters : 0;
            
            // Calculate weighted scores
            const judgeWeightPercentage = settings.scoreWeights.judges;
            const audienceWeightPercentage = settings.scoreWeights.audience;
            
            const judgePercentage = (avgJudgeScore / 10) * 100;
            const weightedJudgeScore = (judgePercentage * judgeWeightPercentage) / 100;
            const audiencePercentage = audienceParticipationRatio * 100;
            const weightedAudienceScore = (audiencePercentage * audienceWeightPercentage) / 100;
            const finalScore = weightedJudgeScore + weightedAudienceScore;

            categoryResults.push({
              contestant,
              finalScore,
              judgeScore: avgJudgeScore,
              audienceVotes: rawAudienceVotes
            });
          }

          // Sort by final score (highest first)
          categoryResults.sort((a, b) => b.finalScore - a.finalScore);
          
          results[categoryId] = {
            category,
            winners: {
              first: categoryResults[0] ? categoryResults[0].contestant : null,
              second: categoryResults[1] ? categoryResults[1].contestant : null,
              third: categoryResults[2] ? categoryResults[2].contestant : null
            },
            scores: categoryResults.map(r => ({
              contestant: r.contestant,
              finalScore: r.finalScore,
              judgeScore: r.judgeScore,
              audienceVotes: r.audienceVotes
            })),
            publishedAt: winners ? winners.publishedAt : new Date().toISOString(),
            type: 'calculated' // Calculated from scores
          };
        }
      }
    });

    res.json({ 
      published: true, 
      results 
    });
  } catch (error) {
    console.error('Error fetching audience results:', error);
    res.status(500).json({ message: 'Error fetching results' });
  }
});

// Get category statistics (vote counts) - only if voting is open
router.get('/categories/:categoryId/stats', async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check if voting is open
    const settings = await dataManager.readData('settings');
    if (!settings.votingOpen) {
      return res.status(403).json({ message: 'Statistics not available when voting is closed' });
    }

    const [contestants, scores] = await Promise.all([
      dataManager.readData('contestants'),
      dataManager.readData('scores')
    ]);

    const categoryContestants = contestants.list.filter(c => c.categoryId === categoryId);
    const stats = categoryContestants.map(contestant => ({
      id: contestant.id,
      name: contestant.name,
      company: contestant.company,
      votes: scores.audienceVotes ? scores.audienceVotes[contestant.id] || 0 : 0
    }));

    // Sort by vote count
    stats.sort((a, b) => b.votes - a.votes);

    res.json({ categoryId, stats });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching category statistics' });
  }
});

module.exports = router;