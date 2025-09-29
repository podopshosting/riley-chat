<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// AWS SDK for PHP would go here, but for now let's use a simple approach
// This would connect to DynamoDB and return real SMS data

$conversations = [
    [
        'conversationId' => '+15551234567',
        'customerName' => 'SMS Test User',
        'status' => 'active',
        'lastMessage' => 'Hello Riley',
        'lastActivity' => '2025-08-06T17:38:34.619Z'
    ],
    [
        'conversationId' => '+15551234999',
        'customerName' => 'Tedy Pickles',
        'status' => 'active',
        'lastMessage' => 'Hi, I am Riley with Panda Exteriors! What is your full name?',
        'lastActivity' => '2025-08-07T00:54:22.3NZ'
    ],
    [
        'conversationId' => '+13015551234',
        'customerName' => 'Real SMS User',
        'status' => 'active',
        'lastMessage' => 'Hello Riley from real SMS',
        'lastActivity' => '2025-08-06T17:51:50.650Z'
    ]
];

// Map statuses to new funnel stages
foreach ($conversations as &$conv) {
    switch ($conv['status']) {
        case 'active':
            $conv['status'] = 'new_leads';
            break;
        case 'in_progress':
            $conv['status'] = 'qualified';
            break;
        case 'completed':
            $conv['status'] = 'completed';
            break;
        case 'discarded':
            $conv['status'] = 'lost';
            break;
        default:
            $conv['status'] = 'new_leads';
    }
}

echo json_encode([
    'success' => true,
    'conversations' => $conversations,
    'messages' => [],
    'timestamp' => date('c')
]);
?>