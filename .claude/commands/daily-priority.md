---
description: Daily prioritization routine checking strategy alignment and active initiatives
---

Perform a comprehensive daily prioritization review by analyzing current insights, initiatives, and strategic alignment.

**Step 1: Load Product Strategy**

Read the PRODUCT_STRATEGY.md file to understand:
- Current product objectives and key results
- Active domains and their initiatives
- Strategic priorities for the quarter

**Step 2: Fetch Latest Productboard Notes**

Use the Productboard skill to retrieve the 100 most recent notes:
```bash
node .claude/skills/productboard.js all-notes 100
```

Analyze these notes against the product strategy to identify:
- Which notes align with current strategic domains (AI & Agents, Better Dashboard Stories, Less GREMLIN Confusion, Future State Step 1)
- Customer feedback patterns that support or challenge current priorities
- Emerging themes that may require strategic attention
- High-impact insights that need immediate follow-up

**Step 3: Check Jira Initiatives**

Use the Jira skill to find all in-progress initiatives in Project AI:
```bash
node .claude/skills/jira.js search "project=AI AND type=Initiative AND status='In Progress'" key,summary,status,assignee,priority
```

For each initiative:
- Verify alignment with PRODUCT_STRATEGY.md domains
- Check if there are blocking issues
- Identify initiatives that may need re-prioritization

**Step 4: Cross-Reference with Current Features**

Compare findings against:
- The active initiatives listed in PRODUCT_STRATEGY.md for each domain
- Company and product objectives
- Current quarter key results

**Step 5: Generate Prioritization Report**

Create a comprehensive report in `workspace/daily-priority-YYYY-MM-DD.md` that includes:

1. **AI-Generated Disclaimer** at the top
2. **Executive Summary**: Top 3-5 priorities for today/this week
3. **Strategic Alignment Analysis**:
   - Notes that strongly support current strategy
   - Notes that suggest strategy adjustments
   - Gaps between customer feedback and current initiatives
4. **Initiative Health Check**:
   - In-progress initiatives with good momentum
   - Initiatives that may be at risk or blocked
   - Recommended initiative priorities
5. **Immediate Follow-ups Required**:
   - Customer insights needing response
   - Blocking issues to address
   - Cross-team coordination needed
6. **Domain-Specific Insights**:
   - AI & Agents domain: relevant feedback and progress
   - Better Dashboard Stories: relevant feedback and progress
   - Less GREMLIN Confusion: relevant feedback and progress
   - Future State Step 1: relevant feedback and progress
7. **Strategic Recommendations**:
   - Should any initiatives be reprioritized?
   - Are we missing opportunities highlighted by recent feedback?
   - What should be escalated to leadership?

**Step 6: Present Key Findings**

After generating the report:
1. Display the executive summary to the user
2. Highlight the top 3-5 action items for immediate attention
3. Provide the path to the full report in workspace/
4. Ask if the user wants to deep-dive into any specific area

**Important Notes:**
- ALWAYS include an AI-generated disclaimer at the top of the report
- Use the workspace/ folder for all generated reports
- Focus on actionable insights, not just data summaries
- Link findings to specific product objectives and domains from PRODUCT_STRATEGY.md
- Be direct about misalignments or risks - this is a decision-making tool
- Include specific note IDs, initiative keys, and references for follow-up
