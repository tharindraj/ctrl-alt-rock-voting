const dataManager = require('../utils/dataManager');
const QRCode = require('qrcode');
const csv = require('csv-parse');
const multer = require('multer');
const path = require('path');

module.exports = async function (context, req) {
    context.log('General API function processing request');

    const resource = req.params.resource;
    const method = req.method.toLowerCase();

    try {
        switch (resource) {
            case 'bands':
                return await handleBands(context, req, method);
            case 'competitions':
                return await handleCompetitions(context, req, method);
            case 'results':
                return await handleResults(context, req, method);
            case 'qr':
                return await generateQR(context, req);
            case 'upload':
                return await handleUpload(context, req);
            default:
                context.res = {
                    status: 404,
                    body: { message: 'API endpoint not found' }
                };
        }
    } catch (error) {
        context.log.error('General API error:', error);
        context.res = {
            status: 500,
            body: { message: 'Internal server error' }
        };
    }
};

async function handleBands(context, req, method) {
    switch (method) {
        case 'get':
            return await getBands(context);
        case 'post':
            return await createBand(context, req);
        case 'put':
            return await updateBand(context, req);
        case 'delete':
            return await deleteBand(context, req);
        default:
            context.res = {
                status: 405,
                body: { message: 'Method not allowed' }
            };
    }
}

async function getBands(context) {
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

async function createBand(context, req) {
    const { name, members, description, competitionId, image } = req.body;

    if (!name || !competitionId) {
        context.res = {
            status: 400,
            body: { message: 'Band name and competition ID are required' }
        };
        return;
    }

    try {
        const bands = await dataManager.readData('bands');
        
        const newBand = {
            id: Date.now(),
            name,
            members: members || [],
            description: description || '',
            competitionId,
            image: image || '',
            createdAt: new Date().toISOString()
        };

        bands.push(newBand);
        await dataManager.writeData('bands', bands);

        context.res = {
            status: 201,
            body: { message: 'Band created successfully', band: newBand }
        };
    } catch (error) {
        context.log.error('Create band error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to create band' }
        };
    }
}

async function updateBand(context, req) {
    const bandId = parseInt(req.query.id);
    const { name, members, description, image } = req.body;

    if (!bandId || !name) {
        context.res = {
            status: 400,
            body: { message: 'Band ID and name are required' }
        };
        return;
    }

    try {
        const bands = await dataManager.readData('bands');
        const bandIndex = bands.findIndex(b => b.id === bandId);

        if (bandIndex === -1) {
            context.res = {
                status: 404,
                body: { message: 'Band not found' }
            };
            return;
        }

        bands[bandIndex] = {
            ...bands[bandIndex],
            name,
            members: members || bands[bandIndex].members,
            description: description || bands[bandIndex].description,
            image: image || bands[bandIndex].image
        };

        await dataManager.writeData('bands', bands);

        context.res = {
            status: 200,
            body: { message: 'Band updated successfully' }
        };
    } catch (error) {
        context.log.error('Update band error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to update band' }
        };
    }
}

async function deleteBand(context, req) {
    const bandId = parseInt(req.query.id);

    if (!bandId) {
        context.res = {
            status: 400,
            body: { message: 'Band ID is required' }
        };
        return;
    }

    try {
        const bands = await dataManager.readData('bands');
        const bandIndex = bands.findIndex(b => b.id === bandId);

        if (bandIndex === -1) {
            context.res = {
                status: 404,
                body: { message: 'Band not found' }
            };
            return;
        }

        bands.splice(bandIndex, 1);
        await dataManager.writeData('bands', bands);

        context.res = {
            status: 200,
            body: { message: 'Band deleted successfully' }
        };
    } catch (error) {
        context.log.error('Delete band error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to delete band' }
        };
    }
}

async function handleCompetitions(context, req, method) {
    switch (method) {
        case 'get':
            return await getCompetitions(context);
        default:
            context.res = {
                status: 405,
                body: { message: 'Method not allowed' }
            };
    }
}

async function getCompetitions(context) {
    try {
        const competitions = await dataManager.readData('competitions');
        context.res = {
            status: 200,
            body: competitions
        };
    } catch (error) {
        context.log.error('Get competitions error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to get competitions' }
        };
    }
}

async function handleResults(context, req, method) {
    if (method !== 'get') {
        context.res = {
            status: 405,
            body: { message: 'Method not allowed' }
        };
        return;
    }

    try {
        const [votes, bands, competitions] = await Promise.all([
            dataManager.readData('votes'),
            dataManager.readData('bands'),
            dataManager.readData('competitions')
        ]);

        // Calculate results
        const results = calculateResults(votes, bands, competitions);

        context.res = {
            status: 200,
            body: results
        };
    } catch (error) {
        context.log.error('Get results error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to get results' }
        };
    }
}

async function generateQR(context, req) {
    const { text, size } = req.query;

    if (!text) {
        context.res = {
            status: 400,
            body: { message: 'Text parameter is required' }
        };
        return;
    }

    try {
        const qrCodeDataUrl = await QRCode.toDataURL(text, {
            width: parseInt(size) || 200,
            margin: 2
        });

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: { qrCode: qrCodeDataUrl }
        };
    } catch (error) {
        context.log.error('QR generation error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to generate QR code' }
        };
    }
}

async function handleUpload(context, req) {
    // For Azure Functions, file uploads need to be handled differently
    // This is a placeholder implementation
    context.res = {
        status: 501,
        body: { message: 'File upload not implemented in Azure Functions yet' }
    };
}

function calculateResults(votes, bands, competitions) {
    const results = {};

    competitions.forEach(competition => {
        results[competition.id] = {
            competition: competition.name,
            bands: []
        };

        const competitionBands = bands.filter(b => b.competitionId === competition.id);
        
        competitionBands.forEach(band => {
            const judgeVotes = votes.judges.filter(v => v.bandId === band.id && v.competitionId === competition.id);
            const audienceVotes = votes.audience.filter(v => v.bandId === band.id && v.competitionId === competition.id);

            // Calculate judge scores (sum of all category scores)
            let totalJudgeScore = 0;
            let judgeCount = 0;
            
            judgeVotes.forEach(vote => {
                if (vote.scores && typeof vote.scores === 'object') {
                    const scoreValues = Object.values(vote.scores);
                    totalJudgeScore += scoreValues.reduce((sum, score) => sum + (parseFloat(score) || 0), 0);
                    judgeCount++;
                }
            });

            const averageJudgeScore = judgeCount > 0 ? totalJudgeScore / judgeCount : 0;
            const audienceVoteCount = audienceVotes.length;

            results[competition.id].bands.push({
                id: band.id,
                name: band.name,
                judgeScore: averageJudgeScore,
                audienceVotes: audienceVoteCount,
                totalScore: averageJudgeScore + audienceVoteCount
            });
        });

        // Sort bands by total score (descending)
        results[competition.id].bands.sort((a, b) => b.totalScore - a.totalScore);
    });

    return results;
}