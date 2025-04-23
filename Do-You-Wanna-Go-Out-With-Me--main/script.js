function moveButton() {
    const noButton = document.getElementById('noButton');
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get button dimensions
    const buttonWidth = noButton.offsetWidth;
    const buttonHeight = noButton.offsetHeight;
    
    // Calculate random position within viewport bounds
    const randomX = Math.floor(Math.random() * (viewportWidth - buttonWidth));
    const randomY = Math.floor(Math.random() * (viewportHeight - buttonHeight));
    
    // Apply new position
    noButton.style.position = 'fixed';
    noButton.style.left = randomX + 'px';
    noButton.style.top = randomY + 'px';
}

function nextPage() {
    window.location.href = 'yes.html';
} 