import React from 'react';
import styled from 'styled-components';

const Loader = () => {
  return (
    <StyledWrapper>
      <div className="glowing-cube">
        <div className="top">
          <img 
            src="/assets/icon-rabbit.svg" 
            alt="Icon Rabbit" 
            className="rabbit-icon"
          />
        </div>
        <div>
          <span data-i="0" />
          <span data-i="1" />
          <span data-i="2" />
          <span data-i="3" />
        </div>
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .glowing-cube {
    position: relative;
    width: 150px;
    height: 150px;
    transform-style: preserve-3d;
    animation: cube-rotate 4s linear infinite;
  }

  @keyframes cube-rotate {
    0% {
      transform: rotatex(-30deg) rotatey(0deg);
    }

    100% {
      transform: rotatex(-30deg) rotatey(360deg);
    }
  }

  .glowing-cube div {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
  }

  .glowing-cube div span {
    position: absolute;
    inset: 0;
    background: linear-gradient(#151515, #3aff5e);
  }

  .glowing-cube div span[data-i="0"] {
    transform: rotatey(calc(90deg * 0)) translatez(calc(150px / 2));
  }
  
  .glowing-cube div span[data-i="1"] {
    transform: rotatey(calc(90deg * 1)) translatez(calc(150px / 2));
  }
  
  .glowing-cube div span[data-i="2"] {
    transform: rotatey(calc(90deg * 2)) translatez(calc(150px / 2));
  }
  
  .glowing-cube div span[data-i="3"] {
    transform: rotatey(calc(90deg * 3)) translatez(calc(150px / 2));
  }

  .glowing-cube .top {
    position: absolute;
    inset: 0;
    background: #222;
    transform: rotatex(90deg) translatez(calc(150px / 2));
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--top-font-color);
    font-size: 7rem;
  }

  .rabbit-icon {
    width: 60px;
    height: 60px;
    object-fit: contain;
  }

  .glowing-cube .top::before {
    content: '';
    position: absolute;
    background: #3aff5e;
    inset: 0;
    transform: translatez(calc(0px - calc(150px + 100px)));
    filter: blur(30px);
    box-shadow: 0 0 120px rgba(58, 134, 255, 0.2),
      0 0 200px rgba(58, 134, 255, 0.4),
      0 0 300px #00ff2f,
      0 0 400px #51fd71,
      0 0 500px #3aff5e;
  }`;

export default Loader; 