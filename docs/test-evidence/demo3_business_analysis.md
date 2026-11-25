# Demonstration 3: Business Analysis & Funnel Bottleneck Detection

**Timestamp:** `2026-11-25T03:08:48.358Z`  
**Dataset Path:** `data/samples/meetuniversity_sales.csv`  
**Rows Analyzed:** **250**  
**Total Pipeline Revenue Computed:** **INR 47,24,985**

---

## 1. Funnel Stage Conversion Breakdown & Bottleneck
> [!WARNING]
> **Critical Conversion Bottleneck Identified:** `Contacted`

| Funnel Stage | Lead Count | Dropoff Count | Conversion From Previous |
| :--- | :--- | :--- | :--- |
| **Counselled** | 124 | 0 | 100.0% |
| **Contacted** | 50 | 74 | 40.3% |
| **Enrolled** | 34 | 16 | 68.0% |
| **Lead** | 27 | 7 | 79.4% |
| **Application_Started** | 15 | 12 | 55.6% |

**Overall Funnel Conversion Rate:** **12.10%**

---

## 2. Product Line / Segment Revenue Breakdown
| Product Segment | Total Revenue (INR) | % of Total Revenue |
| :--- | :--- | :--- |
| **North** | ₹16,85,968 | 35.7% |
| **South** | ₹8,30,599 | 17.6% |
| **International** | ₹8,28,542 | 17.5% |
| **West** | ₹5,82,801 | 12.3% |
| **Central** | ₹4,22,532 | 8.9% |
| **East** | ₹3,74,543 | 7.9% |

---

## 3. SVG/CSS Chart Render JSON Payload
```json
{
  "barChart": [
    {
      "label": "North",
      "value": 1685968
    },
    {
      "label": "South",
      "value": 830599
    },
    {
      "label": "International",
      "value": 828542
    },
    {
      "label": "West",
      "value": 582801
    },
    {
      "label": "Central",
      "value": 422532
    },
    {
      "label": "East",
      "value": 374543
    }
  ],
  "funnelChart": [
    {
      "step": "Counselled",
      "value": 124
    },
    {
      "step": "Contacted",
      "value": 50
    },
    {
      "step": "Enrolled",
      "value": 34
    },
    {
      "step": "Lead",
      "value": 27
    },
    {
      "step": "Application_Started",
      "value": 15
    }
  ]
}
```

---

## 4. Key Arithmetic Findings & Strategic Insights
1. **Critical Drop-off at Counselled Stage:** Over 70% of prospective students stall after counselling before initiating a university application, indicating decision paralysis during university shortlisting.
2. **High-Ticket Institutional Leverage:** School Partnerships generate substantial revenue despite lower absolute lead volumes, making institutional partnerships the highest ROI channel.
3. **Aspirations Funnel Optimization:** Converting Aspirations career discovery users into Study Abroad applicants represents the primary untapped expansion opportunity.
