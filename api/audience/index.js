const dataManager = require('../utils/dataManager');
const auth = require('../middleware/auth');

module.exports = async function (context, req) {
    context.log('Audience function processing request');

    // Apply authentication middleware
    const authResult = await auth(context, req);
    if (authResult.status !== 200) {
        context.res = authResult;
        return;
    }

    // Check audience role
    if (req.user.role !== 'audience') {
        context.res = {
            status: 403,
            body: { message: 'Audience access required' }
        };
        return;
    }

    const action = req.params.action || 'dashboard';
    const method = req.method.toLowerCase();

    try {
        switch (action) {
            case 'dashboard':
                return await getAudienceDashboard(context, req);
            case 'bands':
                return await getBands(context, req);
            case 'vote':
                return await handleVote(context, req, method);
            case 'votes':
                return await getMyVotes(context, req);
            default:
                context.res = {
                    status: 404,
                    body: { message: 'Audience endpoint not found' }
                };
        }
    } catch (error) {
        context.log.error('Audience error:', error);
        context.res = {
            status: 500,
            body: { message: 'Internal server error' }
        };
    }
};

async function getAudienceDashboard(context, req) {
    try {
        const [competitions, bands, votes] = await Promise.all([
            dataManager.readData('competitions'),
            dataManager.readData('bands'),
            dataManager.readData('votes')
        ]);

        const audienceVotes = votes.audience.filter(v => v.audienceId === req.user.id);
        
        context.res = {
            status: 200,
            body: {
                competitions,
                bands,
                myVotes: audienceVotes,
                audienceInfo: {
                    id: req.user.id,
                    loginCode: req.user.loginCode
                }
            }
        };
    } catch (error) {
        context.log.error('Audience dashboard error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to load audience dashboard' }
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

    const { bandId, competitionId } = req.body;

    if (!bandId || !competitionId) {
        context.res = {
            status: 400,
            body: { message: 'bandId and competitionId are required' }
        };
        return;
    }

    try {
        const votes = await dataManager.readData('votes');
        
        // Check if audience member already voted for this competition
        const existingVoteIndex = votes.audience.findIndex(
            v => v.audienceId === req.user.id && v.competitionId === competitionId
        );

        if (existingVoteIndex >= 0) {
            context.res = {
                status: 400,
                body: { message: 'You have already voted for this competition' }
            };
            return;
        }

        const newVote = {
            id: Date.now(),
            audienceId: req.user.id,
            bandId,
            competitionId,
            timestamp: new Date().toISOString()
        };

        votes.audience.push(newVote);
        await dataManager.writeData('votes', votes);

        context.res = {
            status: 200,
            body: { 
                message: 'Vote recorded successfully',
                vote: newVote
            }
        };
    } catch (error) {
        context.log.error('Audience vote error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to record vote' }
        };
    }
}

async function getMyVotes(context, req) {
    try {
        const votes = await dataManager.readData('votes');
        const myVotes = votes.audience.filter(v => v.audienceId === req.user.id);
        
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