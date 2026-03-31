const fs = require('fs');

const t = JSON.parse(fs.readFileSync('backend/config/template.json', 'utf8'));
const s3 = JSON.parse(fs.readFileSync('backend/config/step3-application-directions.json', 'utf8'));

const STOP_WORDS = new Set(['system', 'systems', 'support', 'management', 'tools', 'tool', 'analysis', 'analytics', 'development', 'application', 'applications', 'services', 'service', 'platform', 'platforms', 'operations', 'app', 'apps', 'web', 'based', 'design', 'implementation', 'data', 'using', 'online', 'software', 'technology', 'technologies', 'engineering', 'solutions', 'solution', 'framework', 'frameworks']);

let missing = 0;
let added = 0;

s3.groups.forEach(group => {
    group.options.forEach(opt => {
        let kws = new Set();
        opt.label.split(/\s+/).forEach(w => {
            const c = w.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (c.length > 2 && !STOP_WORDS.has(c)) {
                kws.add(c);
            }
        });
        const dkws = [...kws];
        const pool = t.componentPools.domain;

        const match = pool.some(item => {
            const itemStr = item.toLowerCase().replace(/[^a-z0-9]/g, ' ');
            return dkws.some(dk => itemStr.includes(dk));
        });

        if (!match) {
            missing++;
            console.log('MISSING DOMAIN COVERAGE FOR:', opt.label, '(Keywords:', dkws.join(','), ')');
            
            const cleanLabel = opt.label.replace(/[^a-zA-Z\s]/g, '').trim();
            if (!t.componentPools.domain.map(d => d.toLowerCase()).includes(cleanLabel.toLowerCase())) {
                t.componentPools.domain.push(cleanLabel);
                added++;
                console.log(' -> Auto-injected to domain pool:', cleanLabel);
            }
        }
    });
});

if (added > 0) {
    fs.writeFileSync('backend/config/template.json', JSON.stringify(t, null, 4));
    console.log('Fixed', added, 'missing vocabularies!');
} else {
    console.log('All Application Directions are 100% covered!');
}
