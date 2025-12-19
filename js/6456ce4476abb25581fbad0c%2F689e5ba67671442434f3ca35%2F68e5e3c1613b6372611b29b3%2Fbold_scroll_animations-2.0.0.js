/* Bold Scroll Animations v2.0 */
(function(){function init(){const items=[{selector:'.trust-slider_item',delay:0,stagger:60,animation:'slideInLeft'},{selector:'.section_header-wrapper',delay:0,stagger:0,animation:'fadeInUp'},{selector:'.layout227_item',delay:0,stagger:100,animation:'fadeInUp'},{selector:'.layout227_item-step-text',delay:0,stagger:0,animation:'scaleIn'},{selector:'.swiper_offer-card',delay:0,stagger:80,animation:'slideInUp'},{selector:'.home_hero-header_highlights-item-icon',delay:0,stagger:50,animation:'bounceIn'}];const observer=new IntersectionObserver((entries)=>{entries.forEach(entry=>{if(entry.isIntersecting){const delay=parseInt(entry.target.dataset.animDelay)||0;setTimeout(()=>{entry.target.classList.add('sg-visible')},delay);observer.unobserve(entry.target)}})},{threshold:0.3,rootMargin:'0px 0px -5% 0px'});items.forEach(config=>{const elements=document.querySelectorAll(config.selector);elements.forEach((el,idx)=>{el.classList.add('sg-animate',`sg-${config.animation}`);if(config.stagger>0){el.dataset.animDelay=idx*config.stagger}observer.observe(el)})});addStyles()}function addStyles(){const style=document.createElement('style');style.textContent=`
.sg-animate{opacity:0;transition:all 450ms cubic-bezier(0.34,1.56,0.64,1)}
.sg-animate.sg-visible{opacity:1}
.sg-fadeInUp{transform:translateY(60px) scale(0.95)}
.sg-fadeInUp.sg-visible{transform:translateY(0) scale(1)}
.sg-slideInLeft{transform:translateX(-60px) scale(0.9)}
.sg-slideInLeft.sg-visible{transform:translateX(0) scale(1)}
.sg-slideInUp{transform:translateY(80px) scale(0.9)}
.sg-slideInUp.sg-visible{transform:translateY(0) scale(1)}
.sg-scaleIn{transform:scale(0.5) rotate(-15deg);transition:all 400ms cubic-bezier(0.68,-0.55,0.265,1.55)}
.sg-scaleIn.sg-visible{transform:scale(1) rotate(0deg)}
.sg-bounceIn{transform:scale(0) rotate(-360deg);transition:all 500ms cubic-bezier(0.68,-0.55,0.265,1.55)}
.sg-bounceIn.sg-visible{transform:scale(1.1) rotate(0deg)}
.sg-bounceIn.sg-visible:hover{transform:scale(1.2) rotate(5deg)}
`;document.head.appendChild(style)}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}else{init()}})();