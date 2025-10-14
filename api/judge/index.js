const dataManager = require('../utils/dataManager');
const auth = require('../middleware/auth');

module.exports = async function (context, req) {
    context.log('Judge function processing request');

    // Apply authentication middleware
    const authResult = await auth(context, req);
    if (authResult.status !== 200) {
        context.res = authResult;
        return;
    }

    // Check judge role
    if (req.user.role !== 'judge') {
        context.res = {
            status: 403,
            body: { message: 'Judge access required' }
        };
        return;
    }

    const action = req.params.action || 'dashboard';
    const method = req.method.toLowerCase();

    try {
        switch (action) {
            case 'dashboard':
                return await getJudgeDashboard(context, req);
            case 'bands':
                return await getBands(context, req);
            case 'vote':
                return await handleVote(context, req, method);
            case 'votes':
                return await getMyVotes(context, req);
            default:
                context.res = {
                    status: 404,
                    body: { message: 'Judge endpoint not found' }
                };
        }
    } catch (error) {
        context.log.error('Judge error:', error);
        context.res = {
            status: 500,
            body: { message: 'Internal server error' }
        };
    }
};

async function getJudgeDashboard(context, req) {
    try {
        const [competitions, bands, votes] = await Promise.all([
            dataManager.readData('competitions'),
            dataManager.readData('bands'),
            dataManager.readData('votes')
        ]);

        const judgeVotes = votes.judges.filter(v => v.judgeId === req.user.id);
        
        context.res = {
            status: 200,
            body: {
                competitions,
                bands,
                myVotes: judgeVotes,
                judgeInfo: {
                    id: req.user.id,
                    email: req.user.email
                }
            }
        };
    } catch (error) {
        context.log.error('Judge dashboard error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to load judge dashboard' }
        };
    }
}

async function getBands(context, req) {
    try {
        const bands = await dataManager.readData('bands');
        context.res = {
            status: 200,
            body: bands
        };
    } catch (error) {
        context.log.error('Get bands error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to get bands' }
        };
    }
}

async function handleVote(context, req, method) {
    if (method !== 'post') {
        context.res = {
            status: 405,
            body: { message: 'Method not allowed' }
        };
        return;
    }

    const { bandId, competitionId, categoryId, scores } = req.body;

    if (!bandId || !competitionId || !categoryId || !scores || typeof scores !== 'object') {
        context.res = {
            status: 400,
            body: { message: 'bandId, competitionId, categoryId, and scores are required' }
        };
        return;
    }

    try {
        const votes = await dataManager.readData('votes');
        
        // Check if judge already voted for this band in this category
        const existingVoteIndex = votes.judges.findIndex(
            v => v.judgeId === req.user.id && 
                 v.bandId === bandId && 
                 v.competitionId === competitionId && 
                 v.categoryId === categoryId
        );

        const newVote = {
            id: Date.now(),
            judgeId: req.user.id,
            bandId,
            competitionId,
            categoryId,
            scores,
            timestamp: new Date().toISOString()
        };

        if (existingVoteIndex >= 0) {
            // Update existing vote
            votes.judges[existingVoteIndex] = newVote;
        } else {
            // Add new vote
            votes.judges.push(newVote);
        }

        await dataManager.writeData('votes', votes);

        context.res = {
            status: 200,
            body: { 
                message: existingVoteIndex >= 0 ? 'Vote updated successfully' : 'Vote recorded successfully',
                vote: newVote
            }
        };
    } catch (error) {
        context.log.error('Judge vote error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to record vote' }
        };
    }
}

async function getMyVotes(context, req) {
    try {
        const votes = await dataManager.readData('votes');
        const myVotes = votes.judges.filter(v => v.judgeId === req.user.id);
        
        context.res = {
            status: 200,
            body: myVotes
        };
    } catch (error) {
        context.log.error('Get my votes error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to get votes' }
        };
    }
}