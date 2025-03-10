const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const path = require("path");
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Helper function to scrape Google Scholar
async function searchGoogleScholar(query) {
    try {
        const response = await axios.get(`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];

        $('.gs_r.gs_or.gs_scl').each((i, element) => {
            results.push({
                title: $(element).find('.gs_rt').text().trim(),
                link: $(element).find('.gs_rt a').attr('href'),
                authors: $(element).find('.gs_a').text().trim(),
                snippet: $(element).find('.gs_rs').text().trim(),
                source: 'Google Scholar'
            });
        });

        return results;
    } catch (error) {
        console.error('Google Scholar search error:', error);
        return [];
    }
}

// Helper function to search ResearchGate
async function searchResearchGate(query) {
    try {
        const searchUrl = `https://www.researchgate.net/search/publication?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('.search-results-item').each((i, element) => {
            results.push({
                title: $(element).find('.publication-title').text().trim(),
                link: 'https://www.researchgate.net' + $(element).find('a').attr('href'),
                authors: $(element).find('.authors').text().trim(),
                snippet: $(element).find('.publication-abstract').text().trim(),
                source: 'ResearchGate'
            });
        });

        return results;
    } catch (error) {
        console.error('ResearchGate error:', error);
        return [];
    }
}

// Semantic Scholar API
async function searchSemanticScholar(query) {
    try {
        const response = await axios.get('https://api.semanticscholar.org/graph/v1/paper/search', {
            params: {
                query: query,
                limit: 10,
                fields: 'title,authors,abstract,url,year,venue'
            }
        });

        return response.data.data
            .filter(paper => paper.title && (paper.url || paper.paperId))
            .map(paper => ({
                title: paper.title,
                authors: paper.authors?.map(a => a.name).join(', ') || 'Unknown Authors',
                link: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
                year: paper.year,
                snippet: paper.abstract || paper.title,
                source: 'Semantic Scholar'
            }));
    } catch (error) {
        console.error('Semantic Scholar error:', error.response?.data || error.message);
        return [];
    }
}

// PubMed API
async function searchPubMed(query) {
    try {
        // First search for IDs
        const searchResponse = await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
            params: {
                db: 'pubmed',
                term: query,
                retmax: 10,
                retmode: 'json'
            }
        });

        if (!searchResponse.data?.esearchresult?.idlist) {
            console.error('Invalid PubMed search response:', searchResponse.data);
            return [];
        }

        const ids = searchResponse.data.esearchresult.idlist;

        // Then fetch details
        const detailsResponse = await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
            params: {
                db: 'pubmed',
                id: ids.join(','),
                retmode: 'json'
            }
        });

        if (!detailsResponse.data?.result) {
            console.error('Invalid PubMed details response:', detailsResponse.data);
            return [];
        }

        return Object.values(detailsResponse.data.result)
            .filter(paper => paper.uid && paper.title)
            .map(paper => ({
                title: paper.title,
                authors: paper.authors?.map(a => a.name).join(', ') || 'Unknown Authors',
                link: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}/`,
                year: paper.pubdate?.substring(0, 4),
                snippet: paper.abstract || paper.title,
                source: 'PubMed'
            }));
    } catch (error) {
        console.error('PubMed error:', error.response?.data || error.message);
        return [];
    }
}

// OpenAlex API
async function searchOpenAlex(query) {
    try {
        const response = await axios.get('https://api.openalex.org/works', {
            params: {
                search: query,
                per_page: 10,
                filter: 'has_doi:true'
            },
            headers: {
                'User-Agent': 'ResearchAssistant/1.0'
            }
        });

        if (!response.data?.results) {
            console.error('Invalid OpenAlex response:', response.data);
            return [];
        }

        return response.data.results
            .filter(paper => paper.title && (paper.doi || paper.open_access_url))
            .map(paper => ({
                title: paper.title,
                authors: paper.authorships?.map(a => a.author.display_name).join(', ') || 'Unknown Authors',
                link: paper.open_access_url || `https://doi.org/${paper.doi}`,
                year: paper.publication_year,
                snippet: paper.abstract || paper.title,
                source: 'OpenAlex'
            }));
    } catch (error) {
        console.error('OpenAlex error:', error.response?.data || error.message);
        return [];
    }
}

// CORE API
async function searchCore(query) {
    try {
        const response = await axios.get('https://api.core.ac.uk/v3/search/works', {
            params: {
                q: query,
                limit: 10
            },
            headers: {
                'Authorization': `Bearer ${process.env.CORE_API_KEY}`
            }
        });

        if (!response.data?.results) {
            console.error('Invalid CORE response:', response.data);
            return [];
        }

        return response.data.results
            .filter(paper => paper.title && (paper.downloadUrl || paper.doi))
            .map(paper => ({
                title: paper.title,
                authors: paper.authors?.map(a => a.name).join(', ') || 'Unknown Authors',
                link: paper.downloadUrl || (paper.doi ? `https://doi.org/${paper.doi}` : ''),
                year: paper.yearPublished,
                snippet: paper.abstract || paper.title,
                source: 'CORE'
            }));
    } catch (error) {
        console.error('CORE error:', error.response?.data || error.message);
        return [];
    }
}

// Europe PMC API
async function searchEuropePMC(query) {
    try {
        const response = await axios.get(
            'https://www.ebi.ac.uk/europepmc/webservices/rest/search',
            {
                params: {
                    query: query,
                    format: 'json',
                    pageSize: 10
                }
            }
        );

        if (!response.data?.resultList?.result) {
            console.error('Invalid Europe PMC response:', response.data);
            return [];
        }

        return response.data.resultList.result
            .filter(paper => paper.title && paper.id) // Only include papers with title and ID
            .map(paper => ({
                title: paper.title,
                authors: paper.authorString || 'Unknown Authors',
                link: `https://europepmc.org/article/${paper.source}/${paper.id}`,
                year: paper.pubYear,
                snippet: paper.abstractText || paper.title,
                source: 'Europe PMC'
            }));
    } catch (error) {
        console.error('Europe PMC error:', error.message);
        return [];
    }
}

// arXiv API with better error handling
async function searchArxiv(query) {
    try {
        const response = await axios.get('http://export.arxiv.org/api/query', {
            params: {
                search_query: query,
                max_results: 10,
                sortBy: 'lastUpdatedDate',
                sortOrder: 'descending'
            }
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        const results = [];

        $('entry').each((i, entry) => {
            const link = $(entry).find('id').text();
            if (link) {
                results.push({
                    title: $(entry).find('title').text().replace(/\n/g, ' ').trim(),
                    authors: $(entry).find('author name').map((_, name) => $(name).text()).get().join(', '),
                    link: link,
                    year: new Date($(entry).find('published').text()).getFullYear(),
                    snippet: $(entry).find('summary').text().replace(/\n/g, ' ').trim(),
                    source: 'arXiv'
                });
            }
        });

        return results;
    } catch (error) {
        console.error('arXiv error:', error.message);
        return [];
    }
}

// DOAJ (Directory of Open Access Journals)
async function searchDOAJ(query) {
    try {
        const response = await axios.get(`https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}`, {
            timeout: 10000, // 10 second timeout
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.data || !response.data.results) {
            console.error('Invalid DOAJ response:', response.data);
            return [];
        }

        return response.data.results
            .filter(item => item.bibjson && item.bibjson.title)
            .map(item => ({
                title: item.bibjson.title,
                authors: item.bibjson.author?.map(a => a.name).join(', ') || 'Unknown',
                year: item.bibjson.year || 'N/A',
                link: item.bibjson.link?.[0]?.url || `https://doaj.org/article/${item.id}`,
                source: 'DOAJ',
                snippet: item.bibjson.abstract || ''
            }));
    } catch (error) {
        console.error('DOAJ error:', error.response?.data || error.message);
        return [];
    }
}

// ERIC (Education Resources Information Center)
async function searchERIC(query) {
    try {
        const response = await axios.get(`https://api.ies.ed.gov/eric/`, {
            params: {
                search: query,
                format: 'json',
                rows: 10
            },
            timeout: 10000, // 10 second timeout
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.data || !response.data.response || !response.data.response.docs) {
            console.error('Invalid ERIC response:', response.data);
            return [];
        }

        return response.data.response.docs
            .filter(item => item.title && item.url)
            .map(item => ({
                title: item.title,
                authors: item.author || 'Unknown',
                year: item.publicationDateTime?.split('-')[0] || 'N/A',
                link: item.url,
                source: 'ERIC',
                snippet: item.description || ''
            }));
    } catch (error) {
        console.error('ERIC error:', error.response?.data || error.message);
        return [];
    }
}

// BASE (Bielefeld Academic Search Engine) - Completely Free
async function searchBASE(query) {
    try {
        const response = await axios.get(
            'https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi',
            {
                params: {
                    func: 'PerformSearch',
                    query: query,
                    format: 'json',
                    hits: 10
                }
            }
        );

        if (!response.data?.response?.docs) {
            console.error('Invalid BASE response:', response.data);
            return [];
        }

        return response.data.response.docs
            .filter(doc => doc.dctitle && doc.dcidentifier)
            .map(doc => ({
                title: doc.dctitle,
                authors: Array.isArray(doc.dccontributor) ? 
                        doc.dccontributor.join(', ') : 
                        doc.dccontributor || 'Unknown Authors',
                link: doc.dcidentifier,
                year: doc.dcyear,
                snippet: doc.dcdescription || doc.dctitle,
                source: 'BASE'
            }));
    } catch (error) {
        console.error('BASE error:', error.message);
        return [];
    }
}

// OpenCitations API
async function searchOpenCitations(query) {
    try {
        // First get DOIs from OpenAlex to search in OpenCitations
        const alexResponse = await axios.get(
            `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=5`
        );

        const dois = alexResponse.data.results
            .filter(paper => paper.doi)
            .map(paper => paper.doi);

        // Get citations for each DOI
        const citationsPromises = dois.map(async (doi) => {
            const response = await axios.get(
                `https://opencitations.net/index/api/v1/citations/${doi}`
            );
            return response.data;
        });

        const citationsResults = await Promise.all(citationsPromises);
        return citationsResults.flat().map(citation => ({
            title: citation.citing_title,
            authors: citation.citing_authors,
            link: `https://doi.org/${citation.citing}`,
            year: citation.year,
            source: 'OpenCitations'
        }));
    } catch (error) {
        console.error('OpenCitations error:', error);
        return [];
    }
}

// Dataverse API
async function searchDataverse(query) {
    try {
        const response = await axios.get(
            `https://demo.dataverse.org/api/search`,
            {
                params: {
                    q: query,
                    type: 'dataset',
                    per_page: 10
                }
            }
        );

        return response.data.data.items.map(dataset => ({
            title: dataset.name,
            authors: dataset.authors?.map(a => a.name).join(', '),
            link: dataset.url,
            year: new Date(dataset.published_at).getFullYear(),
            snippet: dataset.description,
            source: 'Dataverse'
        }));
    } catch (error) {
        console.error('Dataverse error:', error);
        return [];
    }
}

// Google Books API
async function searchGoogleBooks(query) {
    const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY; // Add your API key to .env
    try {
        const response = await axios.get(
            `https://www.googleapis.com/books/v1/volumes`,
            {
                params: {
                    q: query,
                    key: GOOGLE_BOOKS_API_KEY,
                    maxResults: 10
                }
            }
        );

        return response.data.items.map(book => ({
            title: book.volumeInfo.title,
            authors: book.volumeInfo.authors?.join(', ') || 'Unknown Authors',
            link: book.volumeInfo.infoLink,
            year: book.volumeInfo.publishedDate?.substring(0, 4),
            snippet: book.volumeInfo.description,
            source: 'Google Books'
        }));
    } catch (error) {
        console.error('Google Books error:', error);
        return [];
    }
}

// SciELO API
async function searchSciELO(query) {
    try {
        const response = await axios.get(
            'https://search.scielo.org/',
            {
                params: {
                    q: query,
                    format: 'json',
                    count: 10
                }
            }
        );

        if (!response.data?.hits?.hits) {
            console.error('Invalid SciELO response:', response.data);
            return [];
        }

        return response.data.hits.hits
            .filter(hit => hit._source)
            .map(hit => ({
                title: hit._source.title,
                authors: hit._source.authors?.join(', ') || 'Unknown Authors',
                link: hit._source.url || `https://search.scielo.org/${hit._id}`,
                year: hit._source.publication_year,
                snippet: hit._source.abstract || hit._source.title,
                source: 'SciELO'
            }));
    } catch (error) {
        console.error('SciELO error:', error.message);
        return [];
    }
}

// PMC (PubMed Central)
async function searchPMC(query) {
    try {
        const response = await axios.get(
            'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
            {
                params: {
                    db: 'pmc',
                    term: query,
                    retmax: 10,
                    format: 'json'
                }
            }
        );

        if (!response.data?.esearchresult?.idlist) {
            console.error('Invalid PMC search response:', response.data);
            return [];
        }

        const ids = response.data.esearchresult.idlist;
        
        // Get details for each ID
        const detailsResponse = await axios.get(
            'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
            {
                params: {
                    db: 'pmc',
                    id: ids.join(','),
                    format: 'json'
                }
            }
        );

        if (!detailsResponse.data?.result) {
            console.error('Invalid PMC details response:', detailsResponse.data);
            return [];
        }

        return Object.values(detailsResponse.data.result)
            .filter(item => item.uid && item.title)
            .map(paper => ({
                title: paper.title,
                authors: paper.authors?.map(a => a.name).join(', ') || 'Unknown Authors',
                link: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${paper.uid}`,
                year: paper.pubdate?.substring(0, 4),
                snippet: paper.abstract || paper.title,
                source: 'PMC'
            }));
    } catch (error) {
        console.error('PMC error:', error.message);
        return [];
    }
}

app.get("/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ 
                error: 'Query parameter is required',
                message: 'Please provide a search query'
            });
        }

        // Run searches in parallel
        const results = await Promise.all([
            searchDOAJ(query),
            searchSemanticScholar(query),
            searchCore(query),
            searchOpenAlex(query),
            searchPubMed(query),
            searchERIC(query)
        ]);

        // Combine and filter results
        const allResults = results
            .flat()
            .filter(result => result && result.title && result.link);

        // Remove duplicates
        const uniqueResults = allResults.filter((result, index, self) =>
            index === self.findIndex(r => r.title === result.title || r.link === result.link)
        );

        // Get list of sources that returned results
        const sources = [...new Set(uniqueResults.map(r => r.source))];

        res.json({
            results: uniqueResults,
            sources: sources
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ 
            error: 'An error occurred during the search',
            message: error.message || 'Please try again later'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
