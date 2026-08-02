async function run(){ 
    try {
        const res = await fetch('http://localhost:5250/api/admin/riders?startDate=2026-08-01T18:00:00.000Z&endDate=2026-08-02T17:59:59.999Z');
        if (!res.ok) {
            console.error("HTTP error:", res.status);
            const text = await res.text();
            console.log("Body:", text);
        } else {
            const data = await res.json();
            console.log("Success:", data);
        }
    } catch(e) {
        console.error(e);
    }
} 
run();
