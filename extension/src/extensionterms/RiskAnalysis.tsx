import React, { useState, useEffect } from 'react';

interface Risk {
  title: string;
  description: string;
  risk: 'High' | 'Medium' | 'Low' | 'None';
}

interface RiskAnalysisProps {
  risks: Risk[];
  onClose: () => void;
}

const RiskAnalysis: React.FC<RiskAnalysisProps> = ({ risks, onClose }) => {
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [visibleRisks, setVisibleRisks] = useState<boolean[]>([]);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (risks.length > 0) {
      const timers = risks.map((_, index) =>
        setTimeout(() => {
          setVisibleRisks(prev => {
            const newVisible = [...prev];
            newVisible[index] = true;
            return newVisible;
          });
        }, index * 100)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [risks]);

  const toggleExpand = (index: number) => {
    setExpandedCard(expandedCard === index ? null : index);
  };

  const handleClearAll = () => {
    setIsClearing(true);
    setTimeout(() => {
      setVisibleRisks([]);
      setIsClearing(false);
      onClose();
    }, 500);
  };

  // Color coding for the tiles
  const getRiskColor = (risk: 'High' | 'Medium' | 'Low' | 'None') => {
    if (risk === 'High') return '#e53e3e';
    if (risk === 'Medium') return '#ffd600';
    if (risk === 'Low') return '#38a169';
    return '#a0aec0'; // None (gray)
  };

  // Depth effect for tiles
  const getDepthStyle = (index: number) => {
    const baseSize = [64, 80, 56, 40];
    const scales = [0.93, 1.08, 0.88, 0.80];
    const lefts = [40, 0, 70, 120];
    const bottoms = [40, 0, 70, 120];
    const zIndex = [90, 100, 80, 60];
    return {
      position: 'absolute',
      left: `${lefts[index]}px`,
      bottom: `${bottoms[index]}px`,
      transform: `scale(${scales[index]})`,
      zIndex: zIndex[index],
      boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
      opacity: index === 1 ? 1 : 0.7 - index * 0.1,
      transition: 'all 0.4s cubic-bezier(.33,1.44,.56,1)',
      pointerEvents: (index === 1 ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],

    };
  };

  return (
    <div style={styles.riskAnalysisContainer}>
      <div style={styles.riskList}>
        {risks.slice(0, 4).map((risk, index) => (
          <div
            key={index}
            style={{ position: 'absolute' as React.CSSProperties['position'], pointerEvents: 'auto' as React.CSSProperties['pointerEvents'] }}

          >
            <div
              style={{
                ...styles.riskIndicator,
                backgroundColor: getRiskColor(risk.risk),
              }}
            ></div>
            <div style={styles.riskCardContent}>
              <div style={styles.riskCardHeader}>
                <h4 style={styles.riskTitle}>{risk.title}</h4>
                <span style={{
                  ...styles.riskBadge,
                  backgroundColor: getRiskColor(risk.risk),
                }}>
                  {risk.risk === 'None' ? 'No Risk' : `${risk.risk} Risk`}
                </span>
              </div>
              <p
                style={{
                  ...styles.riskDescription,
                  ...(expandedCard === index ? styles.expanded : styles.collapsed),
                }}
              >
                {risk.description}
              </p>
            </div>
            <div style={styles.riskCardFooter}>
              {index === 1 && (
                <>
                  <button
                    onClick={() => toggleExpand(index)}
                    style={styles.cardButton}
                    title={expandedCard === index ? 'Minimize' : 'Expand'}
                  >
                    {expandedCard === index ? <>&#x25B2;</> : <>&#x25BC;</>}
                  </button>
                  <button
                    onClick={onClose}
                    style={styles.cardButton}
                    title="Close"
                  >
                    &#x2715;
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {risks.length > 0 && (
        <div style={styles.footer}>
          <button onClick={handleClearAll} style={styles.clearButton}>
            Clear All
          </button>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  riskAnalysisContainer: {
    position: 'fixed',
    left: '20px',
    bottom: '20px',
    width: '400px',
    minHeight: '230px',
    maxHeight: '92vh',
    zIndex: 11000,
    background: 'transparent',
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    pointerEvents: 'auto',
  },
  riskList: {
    position: 'relative',
    height: '210px',
    width: '100%',
    overflowY: 'visible',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  riskCard: {
    borderRadius: '12px',
    boxShadow: '0 8px 25px rgba(0,0,0,0.10)',
    display: 'flex',
    alignItems: 'stretch',
    marginBottom: '0px',
    minHeight: '60px',
    transition: 'all 0.5s cubic-bezier(.33,1.44,.56,1)',
    width: '320px',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  riskIndicator: {
    width: '10px',
    borderTopLeftRadius: '12px',
    borderBottomLeftRadius: '12px',
    flexShrink: 0,
  },
  riskCardContent: {
    padding: '13px',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  riskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  riskTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: 0,
    marginRight: '10px',
  },
  riskBadge: {
    padding: '5px 10px',
    borderRadius: '12px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold',
    flexShrink: 0,
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  },
  riskDescription: {
    fontSize: '14px',
    color: '#4a5568',
    margin: 0,
    overflow: 'hidden',
    transition: 'max-height 0.4s ease-in-out',
  },
  collapsed: {
    maxHeight: '38px',
  },
  expanded: {
    maxHeight: '130px',
  },
  riskCardFooter: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 15px',
    borderTop: '1px solid #edf2f7',
    alignSelf: 'center',
    gap: '8px',
  },
  cardButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#555',
    marginLeft: '6px',
    marginRight: '6px',
  },
  footer: {
    padding: '8px 0px 0px 25px',
    borderTop: 'none',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  clearButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.3s',
    marginLeft: 'auto',
  },
};

export default RiskAnalysis;
